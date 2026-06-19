package com.example.backend.auth;

import com.example.backend.auth.jwt.CookieUtil;
import com.example.backend.auth.jwt.JwtProvider;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;


@Component
@RequiredArgsConstructor
public class OAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    // 운영에선 app.frontend-base-url(예: https://ballix.vercel.app)을 주입, 로컬은 기본값.
    @Value("${app.frontend-base-url:http://localhost:5173}")
    private String frontendBase;

    private final JwtProvider jwtProvider;
    private final CookieUtil cookieUtil;
    private final UserRepository userRepository;


    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException {
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");

        // 없으면 그 자리에서 생성(find-or-create) — OIDC/OAuth2 어느 경로로 와도 유저 보장.
        // (빈 DB 배포 환경에서 유저 미생성으로 NoSuchElementException 500이 나던 것 방어)
        User user = userRepository.findByEmail(email)
                .orElseGet(() -> userRepository.save(User.create(new CreateUserRequest(name, email))));

        // 정지(비활성) 계정은 토큰 발급 차단 → 로그인 거부.
        // 관리자가 등록한 안내 메시지를 ?error=banned&msg=... 로 실어보내 프론트가 그대로 표시.
        if (!user.isActive()) {
            String url = frontendBase + "/?error=banned";
            String msg = user.getBanMessage();
            if (msg != null && !msg.isBlank()) {
                url += "&msg=" + URLEncoder.encode(msg, StandardCharsets.UTF_8);
            }
            response.sendRedirect(url);
            return;
        }

        // 새 세션 발급(이전 기기 토큰 무효화 → 동시 로그인 차단). DB에 저장 후 토큰에 동일 sid 심음.
        String sessionId = UUID.randomUUID().toString();
        user.startSession(sessionId);
        userRepository.save(user);

        String accessToken = jwtProvider.createAccessToken(user.getId(), user.getEmail(), user.getRole(), sessionId);
        cookieUtil.addCookie(response, "access_token", accessToken);
        response.sendRedirect(frontendBase);
    }




}