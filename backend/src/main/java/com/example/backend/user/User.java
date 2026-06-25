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

    @Column(nullable = false)
    @Builder.Default
    private int score = 0; // 누적 포인트(역배 가중) — 리더보드 순위 기준(감소 안 함)

    @Column(name = "point_balance", nullable = false)
    @Builder.Default
    private int pointBalance = 0; // 보유 포인트(카드뽑기 등에 소비) — 적중 시 +, 뽑기 시 -

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role; // 권한

    @Enumerated(EnumType.STRING)
    @Column(nullable = true)
    private BanType banType; // 밴 타입

    @Column(columnDefinition = "TEXT", nullable = true)
    private String banMessage; // 정지 시 관리자가 등록한 안내 메시지(정지된 유저에게 표시)

    @Column(nullable = false)
    private boolean is_active; // 계정상태 true : 활성 / false : 비활성

    @Column(nullable = true)
    private String sessionId; // 현재 유효 세션 식별자(동시 로그인 차단). 로그인할 때마다 새로 발급 → 이전 기기 토큰 무효화

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

    // 예측 채점 결과를 전적에 반영 (참여 경기 수 +1, 맞췄으면 적중 수 +1, 획득 포인트 누적)
    // 누적(score)·보유(pointBalance) 둘 다 더한다 — 랭킹은 누적, 카드뽑기는 보유 잔액을 쓴다.
    public void scorePrediction(boolean correct, int points) {
        this.matches_played++;
        if (correct) {
            this.correct_count++;
        }
        this.score += points;
        this.pointBalance += points;
    }

    /** 포인트 차감(카드뽑기 등 소비). 음수로 내려가지 않게 클램프 — 잔액 검증은 호출부에서 한다. */
    public void deductPoints(int amount) {
        if (amount > 0) {
            this.pointBalance = Math.max(0, this.pointBalance - amount);
        }
    }

    /** 관리자 지급/조정: 보유 포인트에 amount를 더한다(음수면 차감, 0 미만 클램프). 누적 점수(랭킹)는 건드리지 않는다. */
    public void grantPointBalance(int amount) {
        this.pointBalance = Math.max(0, this.pointBalance + amount);
    }

    // 계정상태 접근자 (Lombok boolean 게터 이름 혼동 방지용 명시 접근자)
    public boolean isActive() {
        return is_active;
    }

    /** 로그인 시 새 세션 발급(이전 기기의 토큰을 무효화 — 동시 로그인 차단). */
    public void startSession(String sessionId) {
        this.sessionId = sessionId;
    }

    /** 본인 닉네임 변경. */
    public void changeName(String name) {
        this.name = name;
    }

    // ── 관리자 조작 ──────────────────────────────────────────
    /** 권한 변경(COMMON_USER ↔ ADMIN_USER). */
    public void changeRole(Role role) {
        this.role = role;
    }

    /** 계정 비활성(정지). 밴타입 + 정지된 유저에게 보여줄 안내 메시지 기록. */
    public void deactivate(BanType type, String message) {
        this.is_active = false;
        this.banType = type;
        this.banMessage = message;
    }

    /** 계정 활성(정지 해제). 정지 사유/메시지도 함께 정리. */
    public void activate() {
        this.is_active = true;
        this.banType = null;
        this.banMessage = null;
    }




}



