package com.example.backend.auth.jwt;

import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtFiller extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;
    private final CookieUtil cookieUtil;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String token = cookieUtil.getCookie(request, "access_token");

        if (token != null && jwtProvider.validate(token)) {
            Long userId = jwtProvider.getUserId(token);

            // 토큰은 유효해도 그 사이 정지(밴)되었거나 삭제된 계정이면 즉시 차단:
            // 인증을 세팅하지 않고 쿠키를 만료시켜 보호 엔드포인트에서 401이 나게 한다.
            // (role도 DB 기준으로 부여 → 관리자가 권한을 바꾸면 다음 요청부터 즉시 반영)
            User user = userRepository.findById(userId).orElse(null);
            if (user == null || !user.isActive()) {
                cookieUtil.deleteCookie(response, "access_token");
                filterChain.doFilter(request, response);
                return;
            }

            // 동시 로그인 차단: 토큰의 세션(sid)이 현재 유효 세션과 다르면 다른 기기에서 로그인된 것.
            // 이전 기기 쿠키를 만료시키고 SESSION_REPLACED 401로 즉시 응답 → 프론트가 경고창 표시.
            // (DB sessionId가 null인 구버전 세션은 검사 생략 — 재로그인 시 sid가 부여되며 활성화)
            String tokenSession = jwtProvider.getSessionId(token);
            if (user.getSessionId() != null && !user.getSessionId().equals(tokenSession)) {
                cookieUtil.deleteCookie(response, "access_token");
                response.setStatus(401);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write(
                        "{\"success\":false,\"code\":\"SESSION_REPLACED\",\"msg\":\"다른 기기에서 로그인되어 로그아웃되었습니다.\",\"data\":null}");
                return;
            }

            var authority = new SimpleGrantedAuthority("ROLE_" + user.getRole());
            var authentication = new UsernamePasswordAuthenticationToken(
                    userId,
                    null,
                    List.of(authority)
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        filterChain.doFilter(request, response);
    }
}