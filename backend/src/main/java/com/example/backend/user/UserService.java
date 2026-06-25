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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    // 내 정보 + 전적 (role 포함 — 프론트는 role == "ADMIN_USER"로 관리자 UI 노출 판단)
    public UserView me(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );
        return UserView.from(user);
    }

    // 본인 닉네임 변경 (로그인 필요). 2~20자, 공백 불가, 다른 유저와 중복 불가.
    @Transactional
    public UserView changeName(Long userId, String rawName) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
        String name = rawName == null ? "" : rawName.trim();
        if (name.length() < 2 || name.length() > 20) {
            throw new BadRequestException("닉네임은 2~20자여야 합니다.");
        }
        if (userRepository.existsByNameAndIdNot(name, userId)) {
            throw new BadRequestException("이미 사용 중인 닉네임입니다.");
        }
        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );
        user.changeName(name);
        return UserView.from(user);
    }

    /** 공식 순위 집계 최소 경기 수 — 미달 유저는 포인트가 높아도 맨 아래로 내린다.
     *  프론트 {@code LEADERBOARD_MIN_MATCHES}(constants.js)와 같은 값으로 유지할 것. */
    private static final int LEADERBOARD_MIN_MATCHES = 5;

    // 리더보드 (포인트 내림차순, 순위 부여 — 페이지네이션. 순위는 페이지 오프셋 기준 전역 번호.
    //          단 최소 경기 수 미달 유저는 맨 아래로)
    public Page<RankView> leaderboard(Pageable pageable) {
        Page<User> page = userRepository.findLeaderboard(LEADERBOARD_MIN_MATCHES, pageable);
        long offset = page.getPageable().getOffset();   // 현재 페이지 시작 인덱스(0-based)
        List<RankView> rows = new ArrayList<>();
        List<User> content = page.getContent();
        for (int i = 0; i < content.size(); i++) {
            rows.add(RankView.of((int) offset + i + 1, content.get(i)));
        }
        return new PageImpl<>(rows, pageable, page.getTotalElements());
    }

    // ── 관리자 페이지: 유저 관리 ───────────────────────────────────────
    /** 전체 유저 목록(관리자, 페이지네이션). q 주면 이름 부분일치 검색. email·권한·계정상태 포함. */
    @Transactional(readOnly = true)
    public Page<AdminUserView> listUsers(String q, Pageable pageable) {
        String query = q == null ? "" : q.trim();
        Page<User> page = query.isBlank()
                ? userRepository.findAll(pageable)
                : userRepository.findByNameContainingIgnoreCase(query, pageable);
        return page.map(AdminUserView::from);
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

    /** 보유 포인트 지급/조정(관리자). amount {@code >0} 지급, {@code <0} 차감(0 미만 클램프). 누적 랭킹 점수는 안 바뀐다. */
    @Transactional
    public AdminUserView grantPoints(Long targetId, int amount) {
        if (amount == 0) {
            throw new BadRequestException("지급할 포인트를 입력하세요.");
        }
        if (Math.abs(amount) > 1_000_000) {
            throw new BadRequestException("한 번에 지급/차감할 수 있는 포인트는 1,000,000 이하입니다.");
        }
        User u = userRepository.findById(targetId)
                .orElseThrow(() -> new NotFoundException("유저를 찾을 수 없습니다."));
        u.grantPointBalance(amount);
        return AdminUserView.from(u);
    }

    /** 계정상태 변경(활성/정지). 본인 계정은 변경 불가. 정지 시 안내 메시지(선택)를 함께 저장. */
    @Transactional
    public AdminUserView changeActive(Long adminUserId, Long targetId, boolean active, String message) {
        if (adminUserId != null && adminUserId.equals(targetId)) {
            throw new BadRequestException("본인 계정상태는 변경할 수 없습니다.");
        }
        User u = userRepository.findById(targetId)
                .orElseThrow(() -> new NotFoundException("유저를 찾을 수 없습니다."));
        if (active) {
            u.activate();
        } else {
            u.deactivate(BanType.ADMIN, message);
        }
        return AdminUserView.from(u);
    }
}
