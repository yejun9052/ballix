package com.example.backend.user.dto;

import com.example.backend.user.User;

import java.time.LocalDateTime;

/**
 * 관리자 페이지용 유저 행. 관리자만 보므로 email·권한·계정상태까지 노출한다.
 */
public record AdminUserView(
        Long id,
        String name,
        String email,
        String role,        // COMMON_USER | ADMIN_USER
        boolean active,     // 계정상태 (true=활성, false=정지)
        String banType,     // ADMIN | SELF | null
        String banMessage,  // 정지 안내 메시지 (정지 상태일 때만 값, 아니면 null)
        int score,          // 누적 포인트
        int matchesPlayed,
        int correctCount,
        LocalDateTime createAt
) {
    public static AdminUserView from(User u) {
        return new AdminUserView(
                u.getId(),
                u.getName(),
                u.getEmail(),
                u.getRole() == null ? null : u.getRole().name(),
                u.isActive(),
                u.getBanType() == null ? null : u.getBanType().name(),
                u.getBanMessage(),
                u.getScore(),
                u.getMatches_played(),
                u.getCorrect_count(),
                u.getCreateAt()
        );
    }
}
