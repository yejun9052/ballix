package com.example.backend.fotmob.matchevent;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * FotMob 경기 이벤트 1건 (골/카드/교체).
 * 폴링 시 matchId 기준으로 일괄 삭제 후 재삽입한다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "match_event", indexes = @Index(name = "idx_event_match", columnList = "match_id"))
public class MatchEvent extends BaseTimeEntity {

    /** ballix 내부 Match PK. */
    @Column(name = "match_id", nullable = false)
    private Long matchId;

    /** GOAL / CARD / SUB */
    @Column(nullable = false)
    private String type;

    @Column(nullable = true)
    private Integer minute;

    @Column(nullable = true)
    private Integer addedTime;

    /** true=홈팀, false=원정팀. */
    @Column(nullable = false)
    private boolean home;

    @Column(name = "fotmob_player_id", nullable = true)
    private Long fotmobPlayerId;

    @Column(nullable = true)
    private String playerName;

    /**
     * 이벤트별 상세.
     * GOAL → "assist by ..." / CARD → "Yellow"·"Red" / SUB → "out:나간선수명"
     */
    @Column(nullable = true)
    private String detail;
}
