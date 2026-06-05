package com.example.backend.auth;

import com.example.backend.auth.jwt.CookieUtil;
import com.example.backend.global.common.CommonResponse;
import com.example.backend.user.dto.CreateUserRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final CookieUtil cookieUtil;


    @PostMapping("/signup")
    public ResponseEntity<CommonResponse<?>> signup(@RequestBody CreateUserRequest request) {
        authService.signup(request);
        return ResponseEntity
                .ok(CommonResponse.success("성공적으로 회원이 등록되었습니다.", null));
    }
    @PostMapping("/logout")
    public ResponseEntity<CommonResponse<?>> logout(HttpServletResponse response) {
        cookieUtil.deleteCookie(response, "access_token");
        return ResponseEntity.ok(CommonResponse.success("로그아웃 성공", null));
    }


}