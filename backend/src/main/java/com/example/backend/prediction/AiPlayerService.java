package com.example.backend.prediction;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.prediction.enums.Winner;
import com.example.backend.user.AiAccount;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 가상 "AI" 유저의 리더보드 참가. 관리자가 경기의 AI 승률을 생성하면, AI가 그 승률에서
 * <b>가장 높은 결과</b>를 찍은 것으로 예측 1건을 기록한다. 경기 종료 시 일반 유저와 동일한
 * 채점 경로({@link PredictionService#gradeMatch})를 타 누적 포인트가 쌓이고 리더보드에 노출된다.
 *
 * <p>AI는 항상 최고 확률(본명)을 찍으므로 역배 가중에서 적중 시 1점 — '안전빵' 기준선 경쟁자다.
 * 픽은 킥오프 전에 1회만 고정(라이브 재예측이 픽을 바꾸지 못함, 사람과 동일 규칙).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiPlayerService {

    private final UserRepository userRepository;
    private final PredictionRepository predictionRepository;
    private final MatchRepository matchRepository;

    /** AI 시스템 유저를 찾거나(없으면) 생성. */
    @Transactional
    public User getOrCreateAiUser() {
        return userRepository.findByEmail(AiAccount.EMAIL)
                .orElseGet(() -> userRepository.save(
                        User.create(new CreateUserRequest(AiAccount.NAME, AiAccount.EMAIL))));
    }

    /**
     * AI 승률이 있는 경기에 AI 예측을 1회 기록(멱등). 가드:
     *  - AI 승률 없음 → 스킵
     *  - 킥오프 지남 → 스킵(시작된 경기는 참가 불가, 사람과 동일)
     *  - 이미 참가함 → 스킵(픽 고정)
     */
    @Transactional
    public void participate(Long matchId) {
        Match match = matchRepository.findById(matchId).orElse(null);
        if (match == null || !match.hasPrediction()) {
            return;
        }
        if (match.getAiHomePct() == null || match.getAiDrawPct() == null || match.getAiAwayPct() == null) {
            return;
        }
        if (match.getMatchTime() != null && match.getMatchTime().isBefore(LocalDateTime.now())) {
            return;   // 이미 시작된 경기엔 참가하지 않음
        }
        User ai = getOrCreateAiUser();
        if (predictionRepository.findByUserIdAndMatchId(ai.getId(), matchId).isPresent()) {
            return;   // 이미 기록됨 — 픽 변경하지 않음
        }
        Winner pick = topPick(match);
        predictionRepository.save(Prediction.create(ai, match, pick));
        log.info("[ai-player] AI 참가 matchId={} 픽={} ({}%/{}%/{}%)",
                matchId, pick, match.getAiHomePct(), match.getAiDrawPct(), match.getAiAwayPct());
    }

    /** AI 승률에서 가장 높은 결과. 동률이면 홈 → 무 → 원정 순. */
    private Winner topPick(Match m) {
        int h = m.getAiHomePct(), d = m.getAiDrawPct(), a = m.getAiAwayPct();
        if (h >= d && h >= a) {
            return Winner.HOME_TEAM;
        }
        if (d >= a) {
            return Winner.DRAW;
        }
        return Winner.AWAY_TEAM;
    }
}
