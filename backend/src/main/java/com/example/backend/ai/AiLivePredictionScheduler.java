package com.example.backend.ai;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 실시간 AI 승률 갱신 — AI 예측이 켜진(predictionEnabled) 진행 중(IN_PLAY) 경기를
 * N분(기본 15분)마다 재예측한다. 다이제스트에 현재 스코어·경과시간이 주입되므로
 * 경기 흐름에 따라 승률이 갱신되고, 기존 예측값을 덮어쓴다.
 *
 * 비용 보호: 대상은 '관리자가 켠 + 진행 중' 경기로 한정되고 주기도 분 단위라 Gemini 호출이 과하지 않다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiLivePredictionScheduler {

    private final MatchRepository matchRepository;
    private final AiPredictionService predictionService;

    @Value("${ai.live-prediction.enabled:true}")
    private boolean enabled;

    @Scheduled(fixedDelayString = "${ai.live-prediction.interval-ms:900000}")  // 기본 15분
    public void refreshLivePredictions() {
        if (!enabled) {
            return;
        }
        List<Match> targets = matchRepository.findByStatusAndPredictionEnabledTrue("IN_PLAY");
        if (targets.isEmpty()) {
            return;
        }
        int ok = 0;
        for (Match m : targets) {
            try {
                predictionService.predict(m.getId(), true);   // force=true → 라이브 상태로 재예측·덮어쓰기
                ok++;
            } catch (Exception e) {
                log.warn("[ai-live] 실시간 승률 갱신 실패 matchId={} : {}", m.getId(), e.getMessage());
            }
        }
        log.info("[ai-live] 실시간 AI 승률 {}경기 갱신", ok);
    }
}
