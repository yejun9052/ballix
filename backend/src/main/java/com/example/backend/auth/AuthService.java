package com.example.backend.auth;


import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.dto.CreateUserRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;

    // 첫 로그인시 작동되는 매서드
    public void signup(CreateUserRequest request) {
        userRepository.save(User.create(request));
    }

}