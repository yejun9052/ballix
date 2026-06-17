package com.example.backend.ai;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 실시간 AI 재예측 스케줄러 단위 테스트 — **핵심은 "하프타임(HT) 제외"**.
 * 시계가 흐르는 전·후반에서만, 킥오프 기준 15분 경계를 넘을 때 재예측되고,
 * HT(시계 정지, 앵커 null)엔 재예측되지 않는지 검증한다. Gemini/DB 없이 Mockito로만.
 */
class AiLivePredictionSchedulerTest {

    private MatchRepository matchRepository;
    private AiPredictionService predictionService;
    private AiLivePredictionScheduler scheduler;

    @BeforeEach
    void setUp() {
        matchRepository = mock(MatchRepository.class);
        predictionService = mock(AiPredictionService.class);
        scheduler = new AiLivePredictionScheduler(matchRepository, predictionService);
        ReflectionTestUtils.setField(scheduler, "enabled", true);
        ReflectionTestUtils.setField(scheduler, "intervalMinutes", 15);
    }

    // ── 헬퍼 ─────────────────────────────────────────────

    /** AI 예측이 켜진 IN_PLAY 경기. */
    private Match liveMatch(long id) {
        Match m = Match.builder()
                .status("IN_PLAY")
                .predictionEnabled(true)
                .build();
        ReflectionTestUtils.setField(m, "id", id);
        return m;
    }

    /** 전·후반 진행 상태로 만든다 — 경과 elapsedSeconds 만큼 시계가 흐름(앵커 설정 → isClockRunning=true). */
    private void running(Match m, int elapsedSeconds) {
        m.updateLive((elapsedSeconds / 60) + "'", elapsedSeconds);
    }

    /** 하프타임 — 숫자 없는 라벨이라 앵커가 비워진다(isClockRunning=false). */
    private void halftime(Match m) {
        m.updateLive("HT", null);
    }

    private void givenLiveTargets(Match... matches) {
        when(matchRepository.findByStatusAndPredictionEnabledTrue("IN_PLAY"))
                .thenReturn(List.of(matches));
    }

    // ── 테스트 ───────────────────────────────────────────

    @Test
    @DisplayName("하프타임 경기는 여러 tick이 지나도 재예측되지 않는다")
    void halftimeMatchIsNeverRepredicted() {
        Match m = liveMatch(1L);
        halftime(m);
        givenLiveTargets(m);

        scheduler.refreshLivePredictions();
        scheduler.refreshLivePredictions();
        scheduler.refreshLivePredictions();

        verify(predictionService, never()).predict(anyLong(), anyBoolean());
    }

    @Test
    @DisplayName("전·후반 진행 경기는 15분 경계를 넘을 때 1회 재예측된다")
    void runningMatchIsRepredictedOnIntervalBoundary() {
        Match m = liveMatch(1L);
        givenLiveTargets(m);

        // 전반 5분 — 첫 관측이라 현재 버킷만 기록(재예측 X)
        running(m, 5 * 60);
        scheduler.refreshLivePredictions();
        verify(predictionService, never()).predict(anyLong(), anyBoolean());

        // 16분 — 15분 경계를 넘었으므로 재예측 1회
        running(m, 16 * 60);
        scheduler.refreshLivePredictions();
        verify(predictionService, times(1)).predict(eq(1L), eq(true));
    }

    @Test
    @DisplayName("재예측되던 경기도 하프타임엔 멈췄다가 후반에 경계를 넘으면 재개된다")
    void repredictionPausesDuringHalftimeAndResumesInSecondHalf() {
        Match m = liveMatch(1L);
        givenLiveTargets(m);

        // 전반 5분 — seed
        running(m, 5 * 60);
        scheduler.refreshLivePredictions();

        // 하프타임 — tick이 여러 번 지나도 재예측 없음
        halftime(m);
        scheduler.refreshLivePredictions();
        scheduler.refreshLivePredictions();
        verify(predictionService, never()).predict(anyLong(), anyBoolean());

        // 후반 46분 — 45분 경계를 넘었으므로 재예측 1회
        running(m, 46 * 60);
        scheduler.refreshLivePredictions();
        verify(predictionService, times(1)).predict(eq(1L), eq(true));
    }

    @Test
    @DisplayName("같은 tick에서 하프타임 경기는 건너뛰고 진행 중 경기만 재예측된다")
    void halftimeMatchSkippedWhileRunningMatchIsRepredicted() {
        Match runningMatch = liveMatch(1L);
        Match htMatch = liveMatch(2L);
        givenLiveTargets(runningMatch, htMatch);

        // seed: 진행 경기는 버킷 기록, HT 경기는 건너뜀
        running(runningMatch, 5 * 60);
        halftime(htMatch);
        scheduler.refreshLivePredictions();

        // 진행 경기는 경계를 넘고, HT 경기는 계속 정지 상태
        running(runningMatch, 16 * 60);
        scheduler.refreshLivePredictions();

        verify(predictionService, times(1)).predict(eq(1L), eq(true));
        verify(predictionService, never()).predict(eq(2L), anyBoolean());
    }

    @Test
    @DisplayName("enabled=false면 아무 것도 재예측하지 않는다")
    void disabledSchedulerDoesNothing() {
        ReflectionTestUtils.setField(scheduler, "enabled", false);
        Match m = liveMatch(1L);
        running(m, 16 * 60);
        givenLiveTargets(m);

        scheduler.refreshLivePredictions();

        verify(predictionService, never()).predict(anyLong(), anyBoolean());
    }
}
