package com.example.backend.auth;

import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Google 로그인은 {@code openid} 스코프를 포함하는 <b>OIDC</b>라, Spring Security가
 * {@code OidcUserService} 경로를 탄다. 따라서 OAuth2용 {@link CustomOAuth2UserService}
 * ({@code DefaultOAuth2UserService} 상속)는 호출되지 않아 유저 upsert가 누락됐고,
 * 빈 DB(배포 환경)에서는 로그인 성공 직후 {@code findByEmail}이 비어 500이 났다.
 *
 * <p>이 OIDC 전용 서비스가 로그인 시 유저를 DB에 생성/조회해 같은 upsert를 보장한다.
 */
@Service
@RequiredArgsConstructor
public class CustomOidcUserService extends OidcUserService {

    private final UserRepository userRepository;

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        OidcUser oidcUser = super.loadUser(userRequest);

        String email = oidcUser.getEmail();
        String name = oidcUser.getAttribute("name");

        // 최초 로그인이면 생성, 이미 있으면 그대로(역할 유지). OAuth2SuccessHandler가 이후 findByEmail로 찾는다.
        User user = userRepository.findByEmail(email).orElseGet(() ->
                userRepository.save(User.create(new CreateUserRequest(name, email)))
        );

        return new DefaultOidcUser(
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())),
                oidcUser.getIdToken(),
                oidcUser.getUserInfo(),
                "email"
        );
    }
}
