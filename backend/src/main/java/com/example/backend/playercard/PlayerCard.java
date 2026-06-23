package com.example.backend.playercard;

import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.user.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 유저가 소유한 선수 카드. 한 유저가 여러 장을 가질 수 있고(중복 가능),
 * 같은 선수 카드를 여러 유저가 가질 수도 있다 — owner(User)는 unique 제약 없는 일반 ManyToOne.
 * PK(id)·생성시각(createAt)은 BaseTimeEntity가 제공한다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "player_cards", indexes = @Index(name = "idx_player_card_owner", columnList = "owner_id"))
public class PlayerCard extends BaseTimeEntity {

    /** 카드 소유자 — 누가 소유하고 있는가(중복 가능: 같은 유저가 여러 카드 보유 가능). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    /** 선수 이름. */
    @Column(name = "player_name", nullable = false)
    private String playerName;

    /** 국적. */
    @Column(nullable = true)
    private String nationality;

    /** 오버롤(종합 능력치). */
    @Column(nullable = true)
    private Integer overall;

    /** 포지션 (예: ST, CM, GK). */
    @Column(nullable = true)
    private String position;

    /** 소속팀. */
    @Column(nullable = true)
    private String team;

    /** 선수 이미지 URL. */
    @Column(name = "image_url", nullable = true, length = 1000)
    private String imageUrl;

    /** 등급 — 오버롤로 자동 산출(아마추어~레전드). {@link Grade} 참고. */
    @Column(nullable = true)
    private String grade;


    public static PlayerCard create(User owner, String playerName, String nationality,
                                    Integer overall, String position, String team, String imageUrl) {
        return PlayerCard.builder()
                .owner(owner)
                .playerName(playerName)
                .nationality(nationality)
                .overall(overall)
                .position(position)
                .team(team)
                .imageUrl(imageUrl)
                .grade(Grade.labelOf(overall))
                .build();
    }

    /** 오버롤 변경 시 등급도 함께 재산출. */
    public void updateOverall(Integer overall) {
        this.overall = overall;
        this.grade = Grade.labelOf(overall);
    }

    /** 저장/수정 직전 항상 오버롤 기준으로 등급을 맞춘다 — 어떤 경로로 만들어도 grade가 항상 일관되게. */
    @PrePersist
    @PreUpdate
    private void assignGrade() {
        this.grade = Grade.labelOf(this.overall);
    }
}
