package com.example.backend.prediction;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 부팅 시 1회: 이미 AI 승률이 생성돼 있는(predictionEnabled) 미시작 경기들에 대해 AI 유저 참가를 보강한다.
 * 이 기능 도입 전에 생성된 경기나 재시작 후에도 AI가 빠지지 않도록 보장(멱등 — 이미 참가했으면 스킵).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiPlayerBackfillRunner implements ApplicationRunner {

    private final MatchRepository matchRepository;
    private final AiPlayerService aiPlayerService;

    @Override
    public void run(ApplicationArguments args) {
        // AI 계정이 항상 존재하도록 부팅 시 1회 보장(참가할 경기가 없어도 계정은 존재 — 이름 예약·관리자 노출).
        aiPlayerService.getOrCreateAiUser();

        List<Match> targets = matchRepository.findByPredictionEnabledTrueAndMatchTimeAfter(LocalDateTime.now());
        int done = 0;
        for (Match m : targets) {
            try {
                aiPlayerService.participate(m.getId());
                done++;
            } catch (Exception e) {
                log.warn("[ai-player] 백필 실패 matchId={} : {}", m.getId(), e.getMessage());
            }
        }
        if (done > 0) {
            log.info("[ai-player] 시작 백필 — AI 참가 대상 경기 {}건 처리", done);
        }
    }
}
