package com.example.backend.prediction;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.notify.NtfyClient;
import com.example.backend.prediction.enums.Winner;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 가상(합성) 경기로 라이프사이클을 돌려 핵심 도메인 로직을 검증한다 — DB/스크래퍼/인증 없이 Mockito로만.
 *  1) 라이브 시계: SCHEDULED→IN_PLAY 시 앵커가 흐르고, HT/종료면 멈춘다(프론트가 보는 isClockRunning/liveStartedAtMs).
 *  2) 역배 가중 채점: AI 승률 순위로 1~3점 차등(본명1 / 2위2 / 최대역배3), 오답0, AI없음 적중1, 멱등, 승자미정 보류.
 * {@link com.example.backend.fotmob.FotmobPrewarmSchedulerTest} 스타일을 따른다.
 */
class VirtualMatchLifecycleTest {

    private PredictionRepository predictionRepository;
    private UserRepository userRepository;
    private MatchRepository matchRepository;
    private NtfyClient ntfy;
    private PredictionService service;

    @BeforeEach
    void setUp() {
        predictionRepository = mock(PredictionRepository.class);
        userRepository = mock(UserRepository.class);
        matchRepository = mock(MatchRepository.class);
        ntfy = mock(NtfyClient.class);
        service = new PredictionService(predictionRepository, userRepository, matchRepository, ntfy);
    }

    // ── 헬퍼 ─────────────────────────────────────────────
    /** 가상 경기 — id/상태만. 채점 로직엔 리그/팀이 불필요(teamName은 null도 "미정"으로 처리). */
    private Match virtualMatch(long id, String status) {
        Match m = Match.builder().status(status).fotmobMatchId(id).build();
        ReflectionTestUtils.setField(m, "id", id);
        return m;
    }

    private User virtualUser() {
        return User.create(new CreateUserRequest("테스터", "tester@ballix.dev"));
    }

    private void givenPredictions(long matchId, Prediction... ps) {
        when(predictionRepository.findByMatchIdForUpdate(matchId)).thenReturn(List.of(ps));
    }

    // ── 1) 라이브 시계 라이프사이클 ───────────────────────
    @Test
    @DisplayName("라이프사이클: IN_PLAY면 시계가 흐르고, HT/종료면 멈춘다")
    void lifecycle_liveClock() {
        Match m = virtualMatch(1L, "SCHEDULED");
        assertThat(m.isClockRunning()).isFalse();
        assertThat(m.getLiveStartedAtMs()).isNull();

        // 진행 시작: 경과 23분(=1380초)
        m.updateScore("IN_PLAY", 0, 0, null);
        m.updateLive("23'", 23 * 60);
        assertThat(m.isClockRunning()).isTrue();
        long expectedAnchor = System.currentTimeMillis() - 23 * 60 * 1000L;
        assertThat(m.getLiveStartedAtMs()).isCloseTo(expectedAnchor, within(5_000L));

        // 하프타임: 숫자 없는 라벨 → 앵커 제거(시계 멈춤, 라벨만)
        m.updateLive("HT", null);
        assertThat(m.isClockRunning()).isFalse();
        assertThat(m.getLiveStartedAtMs()).isNull();

        // 종료: 상태가 IN_PLAY가 아니면 시계는 항상 멈춤
        m.updateScore("FINISHED", 2, 1, "HOME_TEAM");
        assertThat(m.isClockRunning()).isFalse();
        assertThat(m.getWinner()).isEqualTo("HOME_TEAM");
    }

    // ── 2) 역배 가중 채점 ────────────────────────────────
    @Test
    @DisplayName("채점: AI 본명(최고확률) 적중 = 1점, 전적 갱신")
    void grade_favoriteWin_1pt() {
        Match m = virtualMatch(10L, "FINISHED");
        m.applyPrediction(70, 20, 10, 2, 0);                 // HOME 최고확률
        m.updateScore("FINISHED", 2, 0, "HOME_TEAM");
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.HOME_TEAM);
        givenPredictions(10L, p);

        service.gradeMatch(m);

        assertThat(p.getIsCorrect()).isTrue();
        assertThat(p.getEarnedPoints()).isEqualTo(1);
        assertThat(u.getScore()).isEqualTo(1);
        assertThat(u.getCorrect_count()).isEqualTo(1);
        assertThat(u.getMatches_played()).isEqualTo(1);
    }

    @Test
    @DisplayName("채점: 중간 순위(2위) 적중 = 2점")
    void grade_secondRank_2pt() {
        Match m = virtualMatch(11L, "FINISHED");
        m.applyPrediction(50, 30, 20, 1, 1);                 // DRAW=30 (2위)
        m.updateScore("FINISHED", 1, 1, "DRAW");
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.DRAW);
        givenPredictions(11L, p);

        service.gradeMatch(m);

        assertThat(p.getEarnedPoints()).isEqualTo(2);
        assertThat(u.getScore()).isEqualTo(2);
    }

    @Test
    @DisplayName("채점: 최대 역배(최저확률) 적중 = 3점")
    void grade_underdogWin_3pt() {
        Match m = virtualMatch(12L, "FINISHED");
        m.applyPrediction(70, 20, 10, 2, 0);                 // AWAY=10 (최저확률)
        m.updateScore("FINISHED", 0, 1, "AWAY_TEAM");
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.AWAY_TEAM);
        givenPredictions(12L, p);

        service.gradeMatch(m);

        assertThat(p.getEarnedPoints()).isEqualTo(3);
        assertThat(u.getScore()).isEqualTo(3);
    }

    @Test
    @DisplayName("채점: 오답 = 0점, 전적은 참여만 +1")
    void grade_wrong_0pt() {
        Match m = virtualMatch(13L, "FINISHED");
        m.applyPrediction(70, 20, 10, 2, 0);
        m.updateScore("FINISHED", 0, 1, "AWAY_TEAM");        // 실제 원정승
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.HOME_TEAM);   // 홈 찍음 = 오답
        givenPredictions(13L, p);

        service.gradeMatch(m);

        assertThat(p.getIsCorrect()).isFalse();
        assertThat(p.getEarnedPoints()).isEqualTo(0);
        assertThat(u.getScore()).isEqualTo(0);
        assertThat(u.getCorrect_count()).isEqualTo(0);
        assertThat(u.getMatches_played()).isEqualTo(1);
    }

    @Test
    @DisplayName("채점: AI 예측 없는 경기 적중 = 일괄 1점")
    void grade_noAi_flat1pt() {
        Match m = virtualMatch(14L, "FINISHED");             // applyPrediction 미호출 → hasPrediction()=false
        m.updateScore("FINISHED", 2, 1, "HOME_TEAM");
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.HOME_TEAM);
        givenPredictions(14L, p);

        service.gradeMatch(m);

        assertThat(p.getEarnedPoints()).isEqualTo(1);
        assertThat(u.getScore()).isEqualTo(1);
    }

    @Test
    @DisplayName("채점 멱등: 이미 채점된 예측은 다시 집계하지 않는다")
    void grade_idempotent() {
        Match m = virtualMatch(15L, "FINISHED");
        m.applyPrediction(70, 20, 10, 2, 0);
        m.updateScore("FINISHED", 2, 0, "HOME_TEAM");
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.HOME_TEAM);
        givenPredictions(15L, p);

        service.gradeMatch(m);   // 1회차: 채점 → score 1
        service.gradeMatch(m);   // 2회차: 이미 graded → 무시

        assertThat(u.getScore()).isEqualTo(1);
        assertThat(u.getMatches_played()).isEqualTo(1);
    }

    @Test
    @DisplayName("채점: 승자 미확정이면 채점 보류(예측 조회조차 안 함)")
    void grade_noWinner_skips() {
        Match m = virtualMatch(16L, "IN_PLAY");              // winner=null
        User u = virtualUser();
        Prediction p = Prediction.create(u, m, Winner.HOME_TEAM);

        service.gradeMatch(m);

        assertThat(p.isGraded()).isFalse();
        verify(predictionRepository, never()).findByMatchIdForUpdate(anyLong());
    }
}
