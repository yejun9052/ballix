package com.example.backend.prediction;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.prediction.enums.Winner;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PredictionService {

    private final PredictionRepository predictionRepository;
    private final UserRepository userRepository;
    private final MatchRepository matchRepository;

    private static final long WORLD_CUP_LEAGUE_ID = 77L; // 예측 허용 리그(월드컵)


    // 예측하기 (이미 예측했으면 수정)
    public Prediction predict(Long userId, Long matchId, Winner predictedWinner) {
        if (userId == null) {
            throw new RuntimeException("로그인이 필요합니다.");
        }

        User user = userRepository.findById(userId).orElseThrow(
                () -> new RuntimeException("유저를 찾을 수 없습니다.")
        );
        Match match = matchRepository.findById(matchId).orElseThrow(
                () -> new RuntimeException("경기를 찾을 수 없습니다.")
        );

        // 월드컵 경기만 예측 가능
        if (match.getCompetition() == null
                || !Long.valueOf(WORLD_CUP_LEAGUE_ID).equals(match.getCompetition().getFotmobLeagueId())) {
            throw new RuntimeException("월드컵 경기만 예측할 수 있습니다.");
        }

        // 킥오프가 지난 경기는 예측 불가
        if (match.getMatchTime().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("이미 시작된 경기는 예측할 수 없습니다.");
        }

        Prediction prediction = predictionRepository.findByUserIdAndMatchId(userId, matchId).orElse(null);
        if (prediction == null) {
            prediction = Prediction.create(user, match, predictedWinner); // 첫 예측
        } else {
            prediction.changeWinner(predictedWinner); // 재예측
        }
        return predictionRepository.save(prediction);
    }

    // 내 예측 전부 찾기
    public List<Prediction> myPrediction(Long userId) {
        if (userId == null) {
            throw new RuntimeException("로그인이 필요합니다.");
        }
        return predictionRepository.findByUserId(userId).orElseThrow(
                () -> new RuntimeException("예측 내역을 찾을 수 없습니다.")
        );
    }

    // 특정 경기에 대한 내 예측 찾기
    public Prediction findByMatch(Long userId, Long matchId) {
        if (userId == null) {
            throw new RuntimeException("로그인이 필요합니다.");
        }
        return predictionRepository.findByUserIdAndMatchId(userId, matchId).orElseThrow(
                () -> new RuntimeException("해당 경기에 대한 예측이 없습니다.")
        );
    }

    // 경기 종료 시 해당 경기의 모든 예측 채점 (종료 폴링에서 호출)
    @Transactional
    public void gradeMatch(Match match) {
        String actualWinner = match.getWinner();
        if (actualWinner == null) {
            return; // 승자 미확정이면 채점 보류
        }

        List<Prediction> predictions = predictionRepository.findByMatchId(match.getId()).orElse(List.of());
        for (Prediction prediction : predictions) {
            if (prediction.isGraded()) {
                continue; // 이미 채점됨 (멱등)
            }
            boolean correct = prediction.getPredictedWinner().name().equals(actualWinner);
            prediction.grade(correct);
            prediction.getUser().scorePrediction(correct); // 유저 전적 갱신
        }
        predictionRepository.saveAll(predictions);
    }

}
