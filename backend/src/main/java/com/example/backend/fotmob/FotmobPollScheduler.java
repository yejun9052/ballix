package com.example.backend.fotmob;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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

    private volatile boolean firstSync = true;

    /** matchId → 마지막 폴링 시각 (N분 간격 준수용, 메모리 보관). */
    private final Map<Long, LocalDateTime> lastPolled = new ConcurrentHashMap<>();

    @PostConstruct
    void logConfig() {
        log.info("[fotmob-poll] 설정: pollEnabled={} interval={}분 lineupWindow={}분 일정범위=-{}~+{}일(주기 과거={}일) "
                        + "라이브폴링={} 기준={}초+지터({}~{}ms)",
                pollEnabled, intervalMinutes, lineupWindowMinutes, pastDays, futureDays, refreshPastDays,
                livePollEnabled, liveIntervalSeconds, liveJitterMinMs, liveJitterMaxMs);
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

    /** 관리자: 폴링 주기(분) 런타임 변경. */
    public void setIntervalMinutes(int minutes) {
        this.intervalMinutes = Math.max(1, minutes);
        log.info("[fotmob-poll] 폴링 주기 변경 → {}분", this.intervalMinutes);
    }

    public int getIntervalMinutes() {
        return intervalMinutes;
    }
}
