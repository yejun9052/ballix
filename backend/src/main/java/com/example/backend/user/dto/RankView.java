package com.example.backend.user.dto;

import com.example.backend.user.User;

/**
 * 리더보드 한 줄. 이름·전적만 (email 노출 없음).
 */
public record RankView(
        int rank,
        String name,
        int score,          // 누적 포인트(순위 기준)
        int matchesPlayed,
        int correctCount,
        int accuracy
) {
    public static RankView of(int rank, User u) {
        int played = u.getMatches_played();
        int correct = u.getCorrect_count();
        int accuracy = played == 0 ? 0 : (int) Math.round(correct * 100.0 / played);
        return new RankView(rank, u.getName(), u.getScore(), played, correct, accuracy);
    }
}
