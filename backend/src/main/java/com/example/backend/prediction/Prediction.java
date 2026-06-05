package com.example.backend.prediction;

import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.matche.Match;
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

    @Column(nullable = false)
    private String predictedWinner; // 승부 예측

    private Boolean isCorrect; // 맞춤 / 안맞춤 / null(경기 안끝남)
}
