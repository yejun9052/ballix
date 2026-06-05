package com.example.backend.user;

import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.user.dto.CreateUserRequest;
import com.example.backend.user.enums.BanType;
import com.example.backend.user.enums.Role;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "users")
public class User extends BaseTimeEntity {

    @Column(nullable = false)
    private String name; // 이름

    @Column(nullable = false)
    private String email; // 이메일

    @Column(nullable = false)
    private int matches_played; // 참여 경기 수

    @Column(nullable = false)
    private int correct_count; // 맞춘 경기 수

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role; // 권한

    @Enumerated(EnumType.STRING)
    @Column(nullable = true)
    private BanType banType; // 밴 타입

    @Column(nullable = false)
    private boolean is_active; // 계정상태 true : 활성 / false : 비활성

    public static User create(CreateUserRequest request) {
        return User.builder()
                .name(request.name())
                .email(request.email())
                .matches_played(0)
                .correct_count(0)
                .role(Role.COMMON_USER)
                .banType(null)
                .is_active(true)
                .build();
    }




}



