package com.example.backend.auth;

import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    private static final String ALLOWED_DOMAIN = "@gmail.com";

    private final UserRepository userRepository;

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {

        OAuth2User oAuth2User = super.loadUser(request);

        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");

        if (!email.endsWith(ALLOWED_DOMAIN)) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("unauthorized_domain"),
                    "허용되지 않은 도메인입니다: " + email
            );
        }

        User user = userRepository.findByEmail(email).orElseGet(() ->
                userRepository.save(User.create(new CreateUserRequest(name, email)))
        );

        return new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())),
                oAuth2User.getAttributes(),
                "email"
        );
    }
}