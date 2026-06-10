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
    private final OAuth2SuccessHandler oAuth2SuccessHandler;
    private final JwtFiller jwtFiller;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // 1. CSRF 끄기 (JWT 쓰면 불필요)
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 2. 어떤 요청에 인증이 필요한지 설정
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/**").permitAll()
//                        .anyRequest().authenticated() // 로그인된 사용자 전부 ( 1차 잠금 )
                )
                // 3. OAuth2 로그인 설정 ← 핵심 연결
                .oauth2Login(oauth -> oauth
                        // 구글 정보 받아서 처리할 서비스 = 우리가 만든 거
                        .userInfoEndpoint(userInfo -> userInfo
                                .userService(customOAuth2UserService))
                        // 로그인 성공하면 부를 핸들러 = 우리가 만든 거
                        .successHandler(oAuth2SuccessHandler))
                .formLogin(form -> form.disable())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((request, response, ex) ->
                                response.sendRedirect("/oauth2/authorization/google")))
                .addFilterBefore(jwtFiller, UsernamePasswordAuthenticationFilter.class);


        return http.build();

    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // 개발 편의: localhost 모든 포트 허용 (Vite가 5173 점유 시 5174 등으로 떠도 동작)
        config.setAllowedOriginPatterns(List.of("http://localhost:*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);   // ← 쿠키 주고받으려면 필수!

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}