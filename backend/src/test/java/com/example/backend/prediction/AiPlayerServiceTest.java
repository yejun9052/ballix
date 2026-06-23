package com.example.backend.prediction;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.prediction.enums.Winner;
import com.example.backend.user.AiAccount;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AI 가상 유저 참가 로직 — 승률 최고 결과로 픽, 킥오프 전·멱등 가드.
 */
class AiPlayerServiceTest {

    private UserRepository userRepository;
    private PredictionRepository predictionRepository;
    private MatchRepository matchRepository;
    private AiPlayerService service;
    private User aiUser;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        predictionRepository = mock(PredictionRepository.class);
        matchRepository = mock(MatchRepository.class);
        service = new AiPlayerService(userRepository, predictionRepository, matchRepository);
        aiUser = User.create(new CreateUserRequest(AiAccount.NAME, AiAccount.EMAIL));
        ReflectionTestUtils.setField(aiUser, "id", 999L);
        when(userRepository.findByEmail(AiAccount.EMAIL)).thenReturn(Optional.of(aiUser));
        when(predictionRepository.findByUserIdAndMatchId(anyLong(), anyLong())).thenReturn(Optional.empty());
    }

    private Match aiMatch(long id, int h, int d, int a, LocalDateTime kickoff) {
        Match m = Match.builder().status("SCHEDULED").matchTime(kickoff).build();
        ReflectionTestUtils.setField(m, "id", id);
        m.applyPrediction(h, d, a, 2, 1);   // predictionEnabled + aiPredictedAt + pcts
        when(matchRepository.findById(id)).thenReturn(Optional.of(m));
        return m;
    }

    @Test
    @DisplayName("최고 확률 결과로 픽한다 (홈 70 → HOME_TEAM)")
    void picksHighest_home() {
        aiMatch(1L, 70, 20, 10, LocalDateTime.now().plusDays(1));
        service.participate(1L);
        ArgumentCaptor<Prediction> cap = ArgumentCaptor.forClass(Prediction.class);
        verify(predictionRepository).save(cap.capture());
        assertThat(cap.getValue().getPredictedWinner()).isEqualTo(Winner.HOME_TEAM);
        assertThat(AiAccount.is(cap.getValue().getUser())).isTrue();
    }

    @Test
    @DisplayName("원정 확률이 최고면 AWAY_TEAM")
    void picksHighest_away() {
        aiMatch(2L, 20, 25, 55, LocalDateTime.now().plusDays(1));
        service.participate(2L);
        ArgumentCaptor<Prediction> cap = ArgumentCaptor.forClass(Prediction.class);
        verify(predictionRepository).save(cap.capture());
        assertThat(cap.getValue().getPredictedWinner()).isEqualTo(Winner.AWAY_TEAM);
    }

    @Test
    @DisplayName("무승부 확률이 최고면 DRAW")
    void picksHighest_draw() {
        aiMatch(3L, 30, 45, 25, LocalDateTime.now().plusDays(1));
        service.participate(3L);
        ArgumentCaptor<Prediction> cap = ArgumentCaptor.forClass(Prediction.class);
        verify(predictionRepository).save(cap.capture());
        assertThat(cap.getValue().getPredictedWinner()).isEqualTo(Winner.DRAW);
    }

    @Test
    @DisplayName("이미 시작된 경기엔 참가하지 않는다")
    void skipsStartedMatch() {
        aiMatch(4L, 70, 20, 10, LocalDateTime.now().minusMinutes(5));
        service.participate(4L);
        verify(predictionRepository, never()).save(any());
    }

    @Test
    @DisplayName("이미 참가한 경기는 다시 기록하지 않는다(멱등)")
    void idempotent() {
        Match m = aiMatch(5L, 70, 20, 10, LocalDateTime.now().plusDays(1));
        when(predictionRepository.findByUserIdAndMatchId(999L, 5L))
                .thenReturn(Optional.of(Prediction.create(aiUser, m, Winner.HOME_TEAM)));
        service.participate(5L);
        verify(predictionRepository, never()).save(any());
    }

    @Test
    @DisplayName("AI 승률이 없는 경기엔 참가하지 않는다")
    void skipsNoAiPrediction() {
        Match m = Match.builder().status("SCHEDULED").matchTime(LocalDateTime.now().plusDays(1)).build();
        ReflectionTestUtils.setField(m, "id", 6L);
        when(matchRepository.findById(6L)).thenReturn(Optional.of(m));
        service.participate(6L);
        verify(predictionRepository, never()).save(any());
    }
}
