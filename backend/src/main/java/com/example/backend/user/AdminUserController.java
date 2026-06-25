package com.example.backend.user;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import com.example.backend.user.enums.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 관리자 페이지: 유저 목록 조회 + 권한/계정상태 설정. 전부 ROLE_ADMIN_USER 전용.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final UserService userService;

    /** 유저 목록(페이지당 8). q 주면 이름 부분일치 검색. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @GetMapping
    public ResponseEntity<CommonResponse<?>> list(
            @RequestParam(required = false) String q,
            @PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.READ_SUCCESS, userService.listUsers(q, pageable)));
    }

    /** 권한 변경: ?role=ADMIN_USER | COMMON_USER */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}/role")
    public ResponseEntity<CommonResponse<?>> changeRole(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestParam Role role) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.ROLE_CHANGED, userService.changeRole(userId, id, role)));
    }

    /** 계정상태 변경: ?active=true(활성) | false(정지)&message=정지 안내문(정지 시만, 선택) */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}/status")
    public ResponseEntity<CommonResponse<?>> changeStatus(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestParam boolean active,
            @RequestParam(required = false) String message) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.ACCOUNT_STATUS_CHANGED, userService.changeActive(userId, id, active, message)));
    }

    /** 보유 포인트 지급/조정: ?amount=정수(+지급, -차감). 카드뽑기에 쓰는 보유 포인트만 바뀌고 누적 랭킹 점수는 안 바뀐다. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}/points")
    public ResponseEntity<CommonResponse<?>> grantPoints(
            @PathVariable Long id,
            @RequestParam int amount) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.POINTS_GRANTED, userService.grantPoints(id, amount)));
    }
}
