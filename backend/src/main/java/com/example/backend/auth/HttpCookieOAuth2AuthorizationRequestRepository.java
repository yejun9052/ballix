package com.example.backend.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.Base64;

/**
 * OAuth2 인가 요청(state 포함)을 HTTP 세션 대신 <b>쿠키</b>에 저장한다.
 *
 * <p>기본 구현({@code HttpSessionOAuth2AuthorizationRequestRepository})은 서버 세션에 state를 보관하는데,
 * 이 앱은 {@code SessionCreationPolicy.STATELESS}이고 배포 환경(Render 콜드스타트·인스턴스 재시작,
 * Google→백엔드 cross-site 리다이렉트)에서는 그 세션이 콜백까지 살아남지 못해 state 검증이 실패 →
 * 로그인 콜백이 403으로 떨어진다(로컬에선 같은 인스턴스/세션이라 통과). 쿠키 기반은 서버 세션에
 * 의존하지 않으므로 클라우드에서도 안정적이다.
 */
@Component
public class HttpCookieOAuth2AuthorizationRequestRepository
        implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    private static final String COOKIE_NAME = "oauth2_auth_request";
    private static final int MAX_AGE_SECONDS = 180; // 인증 왕복 제한시간(3분)

    // 운영(HTTPS)은 Secure=true. SameSite=Lax면 Google→백엔드 top-level 리다이렉트에서 쿠키가 전송된다.
    @Value("${app.cookie.secure:false}")
    private boolean secure;

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        Cookie cookie = getCookie(request);
        return cookie == null ? null : deserialize(cookie.getValue());
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorizationRequest,
                                         HttpServletRequest request, HttpServletResponse response) {
        if (authorizationRequest == null) {
            deleteCookie(response);
            return;
        }
        addCookie(response, serialize(authorizationRequest));
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request,
                                                                 HttpServletResponse response) {
        OAuth2AuthorizationRequest authRequest = loadAuthorizationRequest(request);
        if (authRequest != null) {
            deleteCookie(response);
        }
        return authRequest;
    }

    // ── 직렬화/역직렬화 (OAuth2AuthorizationRequest는 Serializable) ──
    private String serialize(OAuth2AuthorizationRequest obj) {
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
             ObjectOutputStream oos = new ObjectOutputStream(bos)) {
            oos.writeObject(obj);
            return Base64.getUrlEncoder().encodeToString(bos.toByteArray());
        } catch (IOException e) {
            throw new IllegalStateException("OAuth 인가요청 직렬화 실패", e);
        }
    }

    private OAuth2AuthorizationRequest deserialize(String value) {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(Base64.getUrlDecoder().decode(value));
             ObjectInputStream ois = new ObjectInputStream(bis)) {
            return (OAuth2AuthorizationRequest) ois.readObject();
        } catch (IOException | ClassNotFoundException | IllegalArgumentException e) {
            return null; // 손상/만료 쿠키는 무시
        }
    }

    private void addCookie(HttpServletResponse response, String value) {
        Cookie cookie = new Cookie(COOKIE_NAME, value);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(MAX_AGE_SECONDS);
        cookie.setSecure(secure);
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
    }

    private void deleteCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(COOKIE_NAME, null);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        cookie.setSecure(secure);
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
    }

    private Cookie getCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (COOKIE_NAME.equals(c.getName())) return c;
        }
        return null;
    }
}
