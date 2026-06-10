package com.example.backend.user;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/user")
public class UserController {

    private final UserRepository userRepository;
    private final UserService userService;

    // 내 정보 + 전적 (로그인 필요)
    @GetMapping("/me")
    public ResponseEntity<CommonResponse<?>> me(@AuthenticationPrincipal Long userId) {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", userService.me(userId)));
    }

    // 리더보드 (적중순) - 공개 (페이지당 8개)
    @GetMapping("/leaderboard")
    public ResponseEntity<CommonResponse<?>> leaderboard(@PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity
                .ok(CommonResponse.success("데이터 조회 성공", userService.leaderboard(pageable)));
    }
}
