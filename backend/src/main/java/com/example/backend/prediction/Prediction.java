package com.example.backend.prediction;

import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.match.Match;
import com.example.backend.prediction.enums.Winner;
import com.example.backend.user.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "predictions")
public class Prediction extends BaseTimeEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user; // 참여 유저

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "match_id", nullable = false)
    private Match match; // 무슨 경기

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Winner predictedWinner; // 승부 예측: HOME_TEAM / AWAY_TEAM / DRAW (Match.winner 와 동일 어휘)

    private Boolean isCorrect; // 맞춤 / 안맞춤 / null(경기 안끝남)

    private Integer earnedPoints; // 이 예측으로 얻은 포인트(역배 가중). 채점 전 null, 틀리면 0

    // 예측 생성 (유저 1명이 경기 1개에 처음 예측할 때)
    public static Prediction create(User user, Match match, Winner predictedWinner) {
        return Prediction.builder()
                .user(user)
                .match(match)
                .predictedWinner(predictedWinner)
                .isCorrect(null) // 경기 안 끝남
                .build();
    }

    // 예측 수정 (킥오프 전 재예측)
    public void changeWinner(Winner predictedWinner) {
        this.predictedWinner = predictedWinner;
    }

    // 경기 종료 후 채점 (맞춤/틀림 + 획득 포인트 기록)
    public void grade(boolean correct, int points) {
        this.isCorrect = correct;
        this.earnedPoints = points;
    }

    // 이미 채점됐는지 (중복 채점 방지용)
    public boolean isGraded() {
        return this.isCorrect != null;
    }
}
