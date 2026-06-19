package com.example.backend.auth.jwt;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class CookieUtil {

    // 로컬(same-site HTTP)은 Lax/secure=false 기본. 운영(프론트=Vercel, 백엔드=onrender 서로 다른 사이트)에선
    // app.cookie.same-site=None + app.cookie.secure=true 로 주입해야 크로스사이트로 쿠키가 전송된다.
    @Value("${app.cookie.same-site:Lax}")
    private String sameSite;

    @Value("${app.cookie.secure:false}")
    private boolean secure;

    public void addCookie(HttpServletResponse response, String name, String value) {
        Cookie cookie = new Cookie(name, value);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(60 * 60);              // JWT 만료(1h)와 일치
        cookie.setSecure(secure);               // SameSite=None이면 반드시 true(HTTPS)
        cookie.setAttribute("SameSite", sameSite);
        response.addCookie(cookie);
    }
    public void deleteCookie(HttpServletResponse response, String name) {
        Cookie cookie = new Cookie(name, null);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(0);
        cookie.setSecure(secure);               // 설정 시점과 동일 속성이어야 크로스사이트에서 삭제됨
        cookie.setAttribute("SameSite", sameSite);
        response.addCookie(cookie);
    }

    public String getCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (c.getName().equals(name)) return c.getValue();
        }
        return null;
    }
}