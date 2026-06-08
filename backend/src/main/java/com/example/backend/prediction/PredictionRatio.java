package com.example.backend.prediction;

// 한 경기의 예측 분포 (예측한 사람만 조회 가능). percent는 0~100 정수.
public record PredictionRatio(
        int total,
        int homePercent,
        int drawPercent,
        int awayPercent,
        long homeCount,
        long drawCount,
        long awayCount
) {}
