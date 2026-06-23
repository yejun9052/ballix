package com.example.backend.fotmob.playerstat;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 리그 개인 기록 한 줄 (득점왕/도움왕). FotMob 리그 stats 에서 가져와 캐시한다.
 * 안정적인 식별자인 {@code fotmobLeagueId}(예: 월드컵 77)로 키잉한다 — 내부 Competition PK는
 * 환경(ddl-auto/재적재)마다 달라질 수 있어 리그 ID가 더 견고하다. 갱신 시 리그 단위로 일괄 삭제 후 재삽입.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "player_stat", indexes = @Index(name = "idx_playerstat_league", columnList = "fotmob_league_id"))
public class PlayerStat extends BaseTimeEntity {

    /** FotMob 리그 ID (예: 77=월드컵). */
    @Column(name = "fotmob_league_id", nullable = false)
    private Long fotmobLeagueId;

    /** 기록 종류 — "GOALS"(득점왕) / "ASSISTS"(도움왕). */
    @Column(name = "stat_type", nullable = false)
    private String statType;

    @Column(name = "rank_no", nullable = true)
    private Integer rankNo;

    @Column(name = "fotmob_player_id", nullable = true)
    private Long fotmobPlayerId;

    @Column(nullable = false)
    private String playerName;

    @Column(name = "fotmob_team_id", nullable = true)
    private Long fotmobTeamId;

    @Column(nullable = true)
    private String teamName;

    /** 국가 코드(예: ARG). 라인업/국기 표시용. */
    @Column(name = "country_code", nullable = true)
    private String countryCode;

    /** 기록 값 — 득점왕=골 수, 도움왕=도움 수. */
    @Column(name = "stat_value", nullable = true)
    private Integer statValue;

    @Column(name = "matches_played", nullable = true)
    private Integer matchesPlayed;
}
