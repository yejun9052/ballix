package com.example.backend.fotmob.lineup;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * FotMob 라인업의 선수 1명. 선발/후보 + 평점 + 교체 시각을 담는다.
 * 폴링 시 matchId 기준으로 일괄 삭제 후 재삽입하므로 Match와 연관관계를 두지 않고
 * 외래키 컬럼(matchId)만 보관한다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "lineup_player", indexes = @Index(name = "idx_lineup_match", columnList = "match_id"))
public class LineupPlayer extends BaseTimeEntity {

    /** ballix 내부 Match PK. */
    @Column(name = "match_id", nullable = false)
    private Long matchId;

    @Column(name = "fotmob_player_id", nullable = true)
    private Long fotmobPlayerId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = true)
    private Integer shirtNumber;

    @Column(nullable = true)
    private Integer positionId;

    /** 피치 좌표(0~1). posX=깊이(0=GK쪽,1=공격), posY=좌우. 포메이션 배치도용. */
    @Column(name = "pos_x", nullable = true)
    private Double posX;

    @Column(name = "pos_y", nullable = true)
    private Double posY;

    /** true=홈팀, false=원정팀. */
    @Column(nullable = false)
    private boolean home;

    /** true=선발, false=후보. */
    @Column(nullable = false)
    private boolean starter;

    /** FotMob 평점. 경기 전/직후엔 null일 수 있음. */
    @Column(nullable = true)
    private Double rating;

    /** 교체 투입 시각(분). 선발이면 null. */
    @Column(nullable = true)
    private Integer subInMinute;

    /** 교체 아웃 시각(분). 끝까지 뛰면 null. */
    @Column(nullable = true)
    private Integer subOutMinute;
}
