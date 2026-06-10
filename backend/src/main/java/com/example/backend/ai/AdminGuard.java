package com.example.backend.ai;

import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.enums.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * AI 예측/요약 트리거용 관리자 가드.
 * role이 ADMIN_USER이거나, application.yml ai.admin-emails 화이트리스트에 포함된 이메일이면 허용.
 */
@Component
@RequiredArgsConstructor
public class AdminGuard {

    private final UserRepository userRepository;

    @Value("${ai.admin-emails:}")
    private String adminEmailsCsv;

    public void requireAdmin(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("유저를 찾을 수 없습니다."));

        boolean admin = user.getRole() == Role.ADMIN_USER || adminEmails().contains(user.getEmail());
        if (!admin) {
            throw new UnauthorizedException("관리자만 사용할 수 있습니다.");
        }
    }

    private Set<String> adminEmails() {
        if (adminEmailsCsv == null || adminEmailsCsv.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(adminEmailsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .collect(Collectors.toSet());
    }
}
