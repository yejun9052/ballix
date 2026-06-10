package com.example.backend.user.dto;

import com.example.backend.user.User;

/**
 * 내 정보 응답 DTO. email 등 민감정보 없이 전적만 내린다. accuracy는 적중률 0~100 정수.
 * role/admin은 프론트의 관리자 전용 UI(승률 예측 생성 등) 노출 판단용.
 */
public record UserView(
        Long id,
        String name,
        int matchesPlayed,
        int correctCount,
        int accuracy,
        String role,
        boolean admin
) {
    public static UserView from(User u, boolean admin) {
        int played = u.getMatches_played();
        int correct = u.getCorrect_count();
        int accuracy = played == 0 ? 0 : (int) Math.round(correct * 100.0 / played);
        return new UserView(u.getId(), u.getName(), played, correct, accuracy,
                u.getRole() == null ? null : u.getRole().name(), admin);
    }
}
