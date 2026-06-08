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
        log.info("[fotmob-poll] 설정: pollEnabled={} interval={}분 lineupWindow={}분 일정범위=-{}~+{}일(주기 과거={}일)",
                pollEnabled, intervalMinutes, lineupWindowMinutes, pastDays, futureDays, refreshPastDays);
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
            scheduleService.syncRange(past, futureDays);
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
            return;
        }

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

    /** 관리자: 폴링 주기(분) 런타임 변경. */
    public void setIntervalMinutes(int minutes) {
        this.intervalMinutes = Math.max(1, minutes);
        log.info("[fotmob-poll] 폴링 주기 변경 → {}분", this.intervalMinutes);
    }

    public int getIntervalMinutes() {
        return intervalMinutes;
    }
}
