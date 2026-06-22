package com.example.backend.ai;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 실시간 AI 승률 갱신 — AI 예측이 켜진(predictionEnabled) 진행 중(IN_PLAY) 경기를
 * **킥오프 기준 경과시간 N분(기본 15분) 간격**으로 재예측한다(벽시계 주기가 아님).
 * 다이제스트에 현재 스코어·경과시간이 주입되므로 경기 흐름에 따라 승률이 갱신되고 기존 값을 덮어쓴다.
 *
 * <p>동작 구간: **전·후반(시계가 흐를 때)만**. 하프타임 등 시계 정지 구간(`isClockRunning()==false`)은
 * 건너뛴다 — 경과시간 앵커(`liveStartedAt`)가 HT엔 비워지므로 그 기준으로 판별한다.
 *
 * <p>구현: `tick-ms`(기본 1분)마다 깨어나 각 경기의 경과분을 `interval-minutes` 버킷으로 나누고,
 * 버킷이 이전보다 커질 때(=15·30·45·60·75·90분 경계를 넘을 때) 1회 재예측한다. 경기별 마지막 버킷은
 * 메모리에 들고, 처음 본 경기는 현재 버킷만 기록(재예측 X)해 재시작/중간 진입 시 즉시 호출되는 것을 막는다.
 *
 * <p>비용 보호: 대상은 '관리자가 켠 + 진행 중 + 전·후반' 경기로 한정되고 15분 간격이라 Gemini 호출이 과하지 않다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiLivePredictionScheduler {

    private final MatchRepository matchRepository;
    private final AiPredictionService predictionService;

    @Value("${ai.live-prediction.enabled:true}")
    private volatile boolean enabled;   // 관리자 런타임 on/off 가능(재시작 시 application.yml 값으로 초기화)

    /** 킥오프 기준 재예측 간격(분). 경과 15·30·45·60·75·90분에 재예측. */
    @Value("${ai.live-prediction.interval-minutes:15}")
    private int intervalMinutes;

    /** 관리자: 실시간 AI 예측 on/off 런타임 토글. */
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        log.info("[ai-live] 실시간 AI 예측 런타임 {} (재시작 시 설정값으로 초기화)", enabled ? "켜짐(ON)" : "꺼짐(OFF)");
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int getIntervalMinutes() {
        return intervalMinutes;
    }

    /** 현재 실시간 갱신 대상(진행 중 + 예측 켜진) 경기 수 — 동작 확인용 진단. */
    public int countLiveTargets() {
        return matchRepository.findByStatusAndPredictionEnabledTrue("IN_PLAY").size();
    }

    /** 경기별 마지막으로 재예측한 경과분 버킷(=경과분/interval-minutes). 진행 중 경기만 보관. */
    private final Map<Long, Integer> lastBucketByMatch = new ConcurrentHashMap<>();

    @Scheduled(fixedDelayString = "${ai.live-prediction.tick-ms:60000}")  // 기본 1분마다 경계 확인
    public void refreshLivePredictions() {
        if (!enabled) {
            return;
        }
        List<Match> targets = matchRepository.findByStatusAndPredictionEnabledTrue("IN_PLAY");
        if (targets.isEmpty()) {
            lastBucketByMatch.clear();   // 진행 중 경기 없음 → 추적 상태 정리
            return;
        }
        int interval = Math.max(1, intervalMinutes);
        long now = System.currentTimeMillis();

        for (Match m : targets) {
            // HT 등 시계 정지 구간은 건너뛴다 — 전·후반(시계가 흐를 때)에만 동작.
            if (!m.isClockRunning()) {
                continue;
            }
            Long anchorMs = m.getLiveStartedAtMs();
            if (anchorMs == null) {
                continue;
            }
            int elapsedMin = (int) ((now - anchorMs) / 60000L);
            if (elapsedMin < 0) {
                continue;
            }
            int bucket = elapsedMin / interval;
            Integer last = lastBucketByMatch.get(m.getId());

            // 처음 보는 경기는 현재 버킷만 기록하고 넘어간다(재시작/중간 진입 시 즉시 재예측 방지).
            if (last == null) {
                lastBucketByMatch.put(m.getId(), bucket);
                continue;
            }
            // 15분 경계를 새로 넘었을 때만 1회 재예측.
            if (bucket > last) {
                try {
                    predictionService.predict(m.getId(), true);   // force=true → 라이브 상태로 재예측·덮어쓰기
                    lastBucketByMatch.put(m.getId(), bucket);
                    log.info("[ai-live] matchId={} 경과 {}분 재예측(간격 {}분)", m.getId(), elapsedMin, interval);
                } catch (Exception e) {
                    log.warn("[ai-live] 실시간 승률 갱신 실패 matchId={} : {}", m.getId(), e.getMessage());
                }
            }
        }
        // 더 이상 IN_PLAY가 아닌 경기는 추적에서 제거(메모리 정리).
        lastBucketByMatch.keySet().removeIf(id -> targets.stream().noneMatch(m -> m.getId().equals(id)));
    }
}
