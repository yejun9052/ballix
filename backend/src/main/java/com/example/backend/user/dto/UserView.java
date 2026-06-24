package com.example.backend.user.dto;

import com.example.backend.user.User;

/**
 * 내 정보 응답 DTO. email 등 민감정보 없이 전적만 내린다. accuracy는 적중률 0~100 정수.
 * role은 프론트의 관리자 전용 UI(승률 예측 생성 등) 노출 판단용 — role == "ADMIN_USER"로 검증.
 */
public record UserView(
        Long id,
        String name,
        int score,          // 누적 포인트(랭킹 기준)
        int pointBalance,   // 보유 포인트(카드뽑기 소비)
        int matchesPlayed,
        int correctCount,
        int accuracy,
        String role
) {
    public static UserView from(User u) {
        int played = u.getMatches_played();
        int correct = u.getCorrect_count();
        int accuracy = played == 0 ? 0 : (int) Math.round(correct * 100.0 / played);
        return new UserView(u.getId(), u.getName(), u.getScore(), u.getPointBalance(),
                played, correct, accuracy,
                u.getRole() == null ? null : u.getRole().name());
    }
}
