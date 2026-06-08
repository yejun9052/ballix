package com.example.backend.prediction;

import com.example.backend.prediction.enums.Winner;

/**
 * 예측 응답 DTO. User 엔티티(email 등)를 노출하지 않고 화면에 필요한 것만 내린다.
 */
public record PredictionView(
        Long id,
        Long matchId,
        String homeTeamName,
        String awayTeamName,
        Winner predictedWinner,
        Boolean isCorrect
) {
    public static PredictionView from(Prediction p) {
        var m = p.getMatch();
        return new PredictionView(
                p.getId(),
                m == null ? null : m.getId(),
                m == null || m.getHomeTeam() == null ? null : m.getHomeTeam().getName(),
                m == null || m.getAwayTeam() == null ? null : m.getAwayTeam().getName(),
                p.getPredictedWinner(),
                p.getIsCorrect()
        );
    }
}
