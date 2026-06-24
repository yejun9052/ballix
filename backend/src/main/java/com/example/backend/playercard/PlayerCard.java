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

    /** FotMob 선수 ID — 주간 오버롤 갱신 시 매칭 키. */
    @Column(name = "fotmob_player_id")
    private Long fotmobPlayerId;

    /** 지난 갱신 대비 오버롤 변동. null=최초(미갱신), 0=변동 없음, 음수=하락, 양수=상승. */
    @Column(name = "overall_delta")
    private Integer overallDelta;

    /** 주간 갱신: 새 오버롤로 업데이트하고 delta를 기록한다. */
    public void refreshOverall(int newOverall) {
        this.overallDelta = newOverall - this.overall;
        this.overall = newOverall;
    }

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

    /** 가챠 추첨 결과(drawnGrade)로 등급을 직접 지정 — 오버롤에서 자동 산출하지 않는다. */
    public static PlayerCard createWithGrade(User owner, String playerName, String nationality,
                                             Integer overall, String position, String team,
                                             String imageUrl, String drawnGrade, Long fotmobPlayerId) {
        return PlayerCard.builder()
                .owner(owner)
                .playerName(playerName)
                .nationality(nationality)
                .overall(overall)
                .position(position)
                .team(team)
                .imageUrl(imageUrl)
                .grade(drawnGrade)
                .fotmobPlayerId(fotmobPlayerId)
                .build();
    }

    /** 오버롤 변경 시 등급도 함께 재산출. */
    public void updateOverall(Integer overall) {
        this.overall = overall;
        this.grade = Grade.labelOf(overall);
    }
}
