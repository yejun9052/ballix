package com.example.backend.fotmob;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FotMob 일정 동기화 + 라인업/평점/이벤트 폴링 스케줄러.
 *
 *  - 일정: 부팅 직후 + 30분마다 과거/미래 N일치 동기화 (matchId가 들어오므로 매핑 불필요).
 *  - 폴링: 1분마다 깨어나, 킥오프 lineup-window분 전부터 진행/직후까지의 경기를
 *          interval-minutes(기본 5, 런타임 조정 가능) 간격으로 동기화.
 *          라인업이 뜨면 저장(markLineupSynced), 종료되면 확정+순위 갱신(markFinalized).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FotmobPollScheduler {

    private final MatchRepository matchRepository;
    private final FotmobSyncService syncService;
    private final FotmobScheduleService scheduleService;

    @Value("${fotmob.poll.enabled:true}")
    private boolean pollEnabled;

    @Value("${fotmob.schedule.enabled:true}")
    private boolean scheduleEnabled;

    @Value("${fotmob.poll.lineup-window-minutes:60}")
    private long lineupWindowMinutes;

    @Value("${fotmob.poll.interval-minutes:5}")
    private volatile int intervalMinutes;   // 관리자 런타임 조정 가능

    // ── 라이브 빠른 폴링(초 단위 + 랜덤 지터) 설정 ──
    @Value("${fotmob.poll.live.enabled:true}")
    private boolean livePollEnabled;

    @Value("${fotmob.poll.live.interval-seconds:20}")
    private volatile int liveIntervalSeconds;   // IN_PLAY 경기 1건당 재조회 기준 간격(초)

    @Value("${fotmob.poll.live.jitter-min-ms:300}")
    private int liveJitterMinMs;                 // 매 주기에 더하는 랜덤 지터 하한(ms)

    @Value("${fotmob.poll.live.jitter-max-ms:500}")
    private int liveJitterMaxMs;                 // 〃 상한 — 고정 주기 회피(차단위험↓)

    /** matchId → 다음 라이브 조회 due 시각(epoch ms). 조회할 때마다 N초 + 랜덤(300~500ms)로 재계산. */
    private final Map<Long, Long> liveNextDueMs = new ConcurrentHashMap<>();

    @Value("${fotmob.schedule.past-days:10}")
    private int pastDays;

    @Value("${fotmob.schedule.future-days:10}")
    private int futureDays;

    @Value("${fotmob.schedule.refresh-past-days:2}")
    private int refreshPastDays;   // 주기 재동기화 시 과거 범위(과거 날짜는 거의 안 바뀌어 축소 → 부하·차단위험↓)

    // ── 종료경기 상세 선반영(prewarm) 설정 ──
    // 일정 동기화로 스코어만 들어오고 상세(라인업·이벤트) 크롤이 실패한 종료경기를, 유저가 열기 전에
    // 미리 한가할 때(IN_PLAY 없을 때) 소량씩 채워둔다 → Render free 등에서 request-time lazy 크롤 타임아웃 회피.
    @Value("${fotmob.poll.prewarm.enabled:true}")
    private boolean prewarmEnabled;

    @Value("${fotmob.poll.prewarm.since-days:7}")
    private int prewarmSinceDays;        // 최근 N일 내 종료경기만 대상(오래된 경기 제외)

    @Value("${fotmob.poll.prewarm.limit:3}")
    private int prewarmLimit;            // 한 tick에 선반영할 최대 경기 수(작게 → 메모리·차단 안전)

    @Value("${fotmob.poll.prewarm.cooldown-hours:6}")
    private int prewarmCooldownHours;    // 같은 경기 재크롤 쿨다운(빈 라인업 경기 반복 크롤 방지)

    /** matchId → 마지막 선반영 시도 시각(쿨다운용, 인메모리). 재시작 시 비므로 콜드스타트마다 1회 재시도(bounded). */
    private final Map<Long, LocalDateTime> prewarmAttempted = new ConcurrentHashMap<>();

    private volatile boolean firstSync = true;

    /** matchId → 마지막 폴링 시각 (N분 간격 준수용, 메모리 보관). */
    private final Map<Long, LocalDateTime> lastPolled = new ConcurrentHashMap<>();

    @PostConstruct
    void logConfig() {
        log.info("[fotmob-poll] 설정: pollEnabled={} interval={}분 lineupWindow={}분 일정범위=-{}~+{}일(주기 과거={}일) "
                        + "라이브폴링={} 기준={}초+지터({}~{}ms) 선반영={}(최근{}일·{}건·쿨다운{}h)",
                pollEnabled, intervalMinutes, lineupWindowMinutes, pastDays, futureDays, refreshPastDays,
                livePollEnabled, liveIntervalSeconds, liveJitterMinMs, liveJitterMaxMs,
                prewarmEnabled, prewarmSinceDays, prewarmLimit, prewarmCooldownHours);
    }

    // ── 일정 동기화: 부팅 10초 뒤 + 30분마다 ──────────────────────────
    @Scheduled(initialDelay = 10_000, fixedDelayString = "${fotmob.schedule.interval-ms:1800000}")
    public void syncSchedule() {
        if (!scheduleEnabled) {
            return;
        }
        // 부팅 첫 동기화는 전체 과거범위, 이후 주기 동기화는 최근 과거만 (과거는 거의 안 변함)
        int past = firstSync ? pastDays : refreshPastDays;
        try {
            scheduleService.syncRange(past, futureDays);   // 날짜 ±N일(친선 등)
            scheduleService.syncFullLeagues();             // 시즌 전체 일정(월드컵 — 결승까지)
            scheduleService.syncPlayoffLeagues();          // 예상 브래킷(32강 예상 대진) — 반드시 일정 동기화 뒤에
            firstSync = false;
        } catch (Exception e) {
            log.warn("[fotmob-poll] 일정 동기화 실패(Python 서버 확인): {}", e.getMessage());
        }
    }

    // ── 데이터 폴링: 1분마다 깨어나 N분 간격 체크 ─────────────────────
    @Scheduled(fixedDelayString = "${fotmob.poll.tick-ms:60000}")
    public void poll() {
        if (!pollEnabled) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime from = now.minusHours(12);                  // 진행/직후 종료까지
        LocalDateTime to = now.plusMinutes(lineupWindowMinutes);  // 킥오프 전 라인업 선반영

        List<Match> targets = matchRepository.findPollTargets(from, to);
        if (targets.isEmpty()) {
            if (!lastPolled.isEmpty()) lastPolled.clear();   // 폴링 대상 없으면 캐시 정리(메모리 누수 방지, P4)
            return;
        }
        // 폴링 창을 벗어났거나 종료된 경기 항목 제거 — 끝난 경기가 영구히 쌓이지 않게(P4)
        java.util.Set<Long> targetIds = targets.stream().map(Match::getId).collect(java.util.stream.Collectors.toSet());
        lastPolled.keySet().retainAll(targetIds);

        int synced = 0;
        for (Match m : targets) {
            LocalDateTime last = lastPolled.get(m.getId());
            // 아직 한 번도 안 했거나, N분 경과 시에만 폴링
            if (last != null && ChronoUnit.MINUTES.between(last, now) < intervalMinutes) {
                continue;
            }
            try {
                syncService.syncMatch(m);
                lastPolled.put(m.getId(), now);
                synced++;
            } catch (Exception e) {
                log.warn("[fotmob-poll] 동기화 실패 matchId={} fotmobId={} : {}",
                        m.getId(), m.getFotmobMatchId(), e.getMessage());
            }
        }
        if (synced > 0) {
            log.info("[fotmob-poll] 대상 {}건 중 {}건 동기화 (interval={}분)", targets.size(), synced, intervalMinutes);
        }
    }

    // ── 라이브 빠른 폴링: IN_PLAY 경기의 이벤트·스코어·HT/종료를 초 단위로 즉시 반영 ──
    // 짧은 tick(기본 2초)마다 깨어나, 경기별 due 시각(기준 N초 + 랜덤 300~500ms)이 지난 것만 조회한다.
    // 시계 앵커는 재설정하지 않아(syncLive=updateLiveIfAbsent) 흐르는 시계는 안 흔들리고,
    // 하프타임/골/종료만 빠르게 뜬다. Python 쪽 throttle이 크롤 간 300~500ms 간격도 보장.
    @Scheduled(fixedDelayString = "${fotmob.poll.live.tick-ms:2000}")
    public void liveTick() {
        if (!pollEnabled || !livePollEnabled) {
            return;
        }
        List<Match> live = matchRepository.findByStatusAndFotmobMatchIdIsNotNull("IN_PLAY");
        if (live.isEmpty()) {
            if (!liveNextDueMs.isEmpty()) liveNextDueMs.clear();   // 진행 경기 없으면 due 캐시 정리
            return;
        }
        long now = System.currentTimeMillis();
        int synced = 0;
        for (Match m : live) {
            Long due = liveNextDueMs.get(m.getId());
            if (due != null && now < due) {
                continue;   // 아직 다음 조회 시각 전
            }
            try {
                syncService.syncLive(m);
                synced++;
            } catch (Exception e) {
                log.warn("[fotmob-live] 라이브 동기화 실패 matchId={} fotmobId={} : {}",
                        m.getId(), m.getFotmobMatchId(), e.getMessage());
            }
            // 다음 due = 지금 + N초 + 랜덤(300~500ms) — 매번 새 지터로 고정 주기 회피
            int span = Math.max(1, liveJitterMaxMs - liveJitterMinMs);
            long jitter = liveJitterMinMs + (long) (Math.random() * span);
            liveNextDueMs.put(m.getId(), System.currentTimeMillis() + liveIntervalSeconds * 1000L + jitter);
        }
        if (synced > 0) {
            log.info("[fotmob-live] IN_PLAY {}경기 중 {}건 라이브 동기화 (기준 {}s+지터)",
                    live.size(), synced, liveIntervalSeconds);
        }
    }

    // ── 라이브 시계 재앵커: 진행 중 경기의 시간/스코어만 가볍게 (FotMob SSR ~10분 갱신 → 11분 주기, 드리프트 보정용) ──
    @Scheduled(fixedDelayString = "${fotmob.poll.clock-ms:660000}")
    public void refreshLiveClocks() {
        if (!pollEnabled) {
            return;
        }
        List<Match> live = matchRepository.findByStatusAndFotmobMatchIdIsNotNull("IN_PLAY");
        if (live.isEmpty()) {
            return;
        }
        int ok = 0;
        for (Match m : live) {
            try {
                syncService.refreshLiveClock(m);
                ok++;
            } catch (Exception e) {
                log.warn("[fotmob-clock] 시계 갱신 실패 matchId={} : {}", m.getId(), e.getMessage());
            }
        }
        log.info("[fotmob-clock] 라이브 {}경기 시계 갱신", ok);
    }

    // ── 종료경기 상세 선반영(prewarm): 한가할 때(IN_PLAY 없음) 빈 종료경기 상세를 소량씩 미리 채움 ──
    // 목적: 유저가 종료경기를 처음 열 때 request-time lazy 크롤(느림/타임아웃, Render free에서 특히)이 일어나지 않도록
    // DB를 미리 데워둔다. 라이브 크롤과 경쟁하지 않게 IN_PLAY가 하나라도 있으면 통째로 건너뛴다.
    @Scheduled(fixedDelayString = "${fotmob.poll.prewarm.tick-ms:180000}")
    public void prewarmFinishedDetails() {
        if (!pollEnabled || !prewarmEnabled) {
            return;
        }
        // 진행 중 경기가 있으면 라이브 크롤 지연을 막기 위해 선반영을 미룬다(종료경기 상세는 급하지 않음).
        if (!matchRepository.findByStatusAndFotmobMatchIdIsNotNull("IN_PLAY").isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime since = now.minusDays(prewarmSinceDays);
        // 스캔 윈도우는 limit보다 넉넉히 — 쿨다운에 걸린 경기를 지나 새 대상을 고를 수 있게.
        int scan = Math.max(prewarmLimit * 10, 40);
        List<Match> targets = matchRepository.findDetailBackfillTargets(since, PageRequest.of(0, scan));
        if (targets.isEmpty()) {
            if (!prewarmAttempted.isEmpty()) prewarmAttempted.clear();   // 대상 없으면 캐시 정리
            return;
        }
        int done = 0;
        for (Match m : targets) {
            if (done >= prewarmLimit) {
                break;
            }
            LocalDateTime last = prewarmAttempted.get(m.getId());
            if (last != null && ChronoUnit.HOURS.between(last, now) < prewarmCooldownHours) {
                continue;   // 쿨다운 중 — 빈 라인업 경기 반복 크롤 방지
            }
            try {
                syncService.syncMatch(m);   // HTTP 크롤(트랜잭션 밖) + 독립 트랜잭션 저장. 스크래퍼가 직렬화/throttle.
                done++;
            } catch (Exception e) {
                log.warn("[fotmob-prewarm] 상세 선반영 실패 matchId={} fotmobId={} : {}",
                        m.getId(), m.getFotmobMatchId(), e.getMessage());
            }
            prewarmAttempted.put(m.getId(), now);   // 성공·실패 모두 쿨다운 기록(라인업 없는 경기 폭주 방지)
        }
        // 쿨다운 만료 항목 정리(메모리 누수 방지) — 만료분은 어차피 재시도 대상이라 제거해도 무방.
        prewarmAttempted.values().removeIf(t -> ChronoUnit.HOURS.between(t, now) >= prewarmCooldownHours);
        if (done > 0) {
            log.info("[fotmob-prewarm] 종료경기 상세 선반영 {}건 (대상 {}건, since={}일, limit={}, cooldown={}h)",
                    done, targets.size(), prewarmSinceDays, prewarmLimit, prewarmCooldownHours);
        }
    }

    /** 관리자: 폴링 주기(분) 런타임 변경. */
    public void setIntervalMinutes(int minutes) {
        this.intervalMinutes = Math.max(1, minutes);
        log.info("[fotmob-poll] 폴링 주기 변경 → {}분", this.intervalMinutes);
    }

    public int getIntervalMinutes() {
        return intervalMinutes;
    }
}
