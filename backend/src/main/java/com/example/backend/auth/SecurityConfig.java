package com.example.backend.auth;


import com.example.backend.auth.jwt.JwtFiller;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity   // @PreAuthorize 활성화 (관리자 전용 트리거 엔드포인트 보호)
@RequiredArgsConstructor
public class SecurityConfig {
    private final CustomOAuth2UserService customOAuth2UserService;
    private final CustomOidcUserService customOidcUserService;
    private final OAuth2SuccessHandler oAuth2SuccessHandler;
    private final JwtFiller jwtFiller;
    private final HttpCookieOAuth2AuthorizationRequestRepository cookieAuthRequestRepository;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // 1. CSRF 끄기 (JWT 쓰면 불필요)
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 2. 어떤 요청에 인증이 필요한지 설정
                .authorizeHttpRequests(auth -> auth
                        // OAuth 로그인 경로/에러도 명시적으로 허용(미허용 시 콜백이 fall-through 403됨)
                        .requestMatchers("/api/**", "/oauth2/**", "/login/**", "/error").permitAll()
                        .anyRequest().permitAll()  // URL 단계는 개방, 실제 인가는 JwtFiller+@PreAuthorize가 담당
                )
                // 3. OAuth2 로그인 설정 ← 핵심 연결
                .oauth2Login(oauth -> oauth
                        // 인가요청(state)을 세션 대신 쿠키에 저장 → STATELESS·클라우드에서 콜백까지 보존
                        .authorizationEndpoint(a -> a.authorizationRequestRepository(cookieAuthRequestRepository))
                        // 구글 정보 받아서 처리할 서비스 = 우리가 만든 거
                        // Google은 OIDC라 oidcUserService가 실제로 호출된다(userService는 비OIDC 대비).
                        .userInfoEndpoint(userInfo -> userInfo
                                .userService(customOAuth2UserService)
                                .oidcUserService(customOidcUserService))
                        // 로그인 성공하면 부를 핸들러 = 우리가 만든 거
                        .successHandler(oAuth2SuccessHandler))
                .formLogin(form -> form.disable())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((request, response, ex) -> {
                            // /api/** 는 JSON 401, 나머지는 OAuth 리다이렉트
                            if (request.getRequestURI().startsWith("/api/")) {
                                response.setStatus(401);
                                response.setContentType("application/json;charset=UTF-8");
                                response.getWriter().write("{\"success\":false,\"msg\":\"로그인이 필요합니다.\",\"data\":null}");
                            } else {
                                response.sendRedirect("/oauth2/authorization/google");
                            }
                        }))
                .addFilterBefore(jwtFiller, UsernamePasswordAuthenticationFilter.class);


        return http.build();

    }

    // 운영에선 app.cors.allowed-origins로 Vercel 도메인을 주입(쉼표구분),
    // 로컬은 기본값(localhost 모든 포트). 패턴이라 https://*.vercel.app 같은 와일드카드도 가능.
    @org.springframework.beans.factory.annotation.Value("${app.cors.allowed-origins:http://localhost:*}")
    private String allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);   // ← 쿠키 주고받으려면 필수!

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}