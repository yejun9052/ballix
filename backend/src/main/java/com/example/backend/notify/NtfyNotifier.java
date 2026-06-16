package com.example.backend.notify;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.team.Team;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 경기 시작 임박 알림 — 1분 tick으로 킥오프가 start-window-minutes 이내인 예정 경기를 찾아 1회 알림.
 * 이미 알린 경기는 메모리 Set으로 중복 방지(재부팅 시 초기화 — 개발용으로 충분).
 * 종료/예측채점/공지 알림은 각 도메인 서비스(FotmobSyncService·PredictionService·NoticeService)에서 직접 보낸다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NtfyNotifier {

    private static final DateTimeFormatter KST = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    private final MatchRepository matchRepository;
    private final NtfyClient ntfy;

    @Value("${ntfy.enabled:false}")
    private boolean enabled;

    @Value("${ntfy.start-window-minutes:10}")
    private long startWindowMinutes;

    /** 이미 시작 알림을 보낸 matchId(중복 방지). */
    private final Set<Long> startNotified = ConcurrentHashMap.newKeySet();

    @Scheduled(fixedDelayString = "${ntfy.start-tick-ms:60000}")
    @Transactional(readOnly = true)
    public void notifyUpcoming() {
        if (!enabled || startWindowMinutes <= 0) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        List<Match> soon = matchRepository.findByStatusAndMatchTimeBetween(
                "SCHEDULED", now, now.plusMinutes(startWindowMinutes));
        for (Match m : soon) {
            if (!startNotified.add(m.getId())) {
                continue;   // 이미 알림
            }
            long mins = Math.max(0, ChronoUnit.MINUTES.between(now, m.getMatchTime()));
            String body = String.format("%s vs %s%n약 %d분 후 킥오프 (%s)",
                    teamName(m.getHomeTeam()), teamName(m.getAwayTeam()), mins, m.getMatchTime().format(KST));
            ntfy.send("Match Starting Soon", body, "soccer");
        }
    }

    private String teamName(Team t) {
        return t == null || t.getName() == null ? "미정" : t.getName();
    }
}
