package com.example.backend.user;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.user.dto.AdminUserView;
import com.example.backend.user.dto.RankView;
import com.example.backend.user.dto.UserView;
import com.example.backend.user.enums.BanType;
import com.example.backend.user.enums.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Value("${ai.admin-emails:}")
    private String adminEmailsCsv;

    // 내 정보 + 전적 (role/admin 포함 — 관리자 전용 UI 노출 판단용)
    public UserView me(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );
        boolean admin = user.getRole() == Role.ADMIN_USER || adminEmails().contains(user.getEmail());
        return UserView.from(user, admin);
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

    // 리더보드 (적중수 내림차순, 순위 부여 — 페이지네이션. 순위는 페이지 오프셋 기준 전역 번호)
    public Page<RankView> leaderboard(Pageable pageable) {
        Page<User> page = userRepository.findLeaderboard(pageable);
        long offset = page.getPageable().getOffset();   // 현재 페이지 시작 인덱스(0-based)
        List<RankView> rows = new ArrayList<>();
        List<User> content = page.getContent();
        for (int i = 0; i < content.size(); i++) {
            rows.add(RankView.of((int) offset + i + 1, content.get(i)));
        }
        return new PageImpl<>(rows, pageable, page.getTotalElements());
    }

    // ── 관리자 페이지: 유저 관리 ───────────────────────────────────────
    /** 전체 유저 목록(관리자, 페이지네이션). email·권한·계정상태 포함. */
    @Transactional(readOnly = true)
    public Page<AdminUserView> listUsers(Pageable pageable) {
        return userRepository.findAll(pageable).map(AdminUserView::from);
    }

    /** 권한 변경. 본인 권한은 변경 불가(셀프 잠금 방지). */
    @Transactional
    public AdminUserView changeRole(Long adminUserId, Long targetId, Role role) {
        if (role == null) {
            throw new BadRequestException("변경할 권한(role)이 올바르지 않습니다.");
        }
        if (adminUserId != null && adminUserId.equals(targetId)) {
            throw new BadRequestException("본인 권한은 변경할 수 없습니다.");
        }
        User u = userRepository.findById(targetId)
                .orElseThrow(() -> new NotFoundException("유저를 찾을 수 없습니다."));
        u.changeRole(role);
        return AdminUserView.from(u);
    }

    /** 계정상태 변경(활성/정지). 본인 계정은 변경 불가. */
    @Transactional
    public AdminUserView changeActive(Long adminUserId, Long targetId, boolean active) {
        if (adminUserId != null && adminUserId.equals(targetId)) {
            throw new BadRequestException("본인 계정상태는 변경할 수 없습니다.");
        }
        User u = userRepository.findById(targetId)
                .orElseThrow(() -> new NotFoundException("유저를 찾을 수 없습니다."));
        if (active) {
            u.activate();
        } else {
            u.deactivate(BanType.ADMIN);
        }
        return AdminUserView.from(u);
    }
}
