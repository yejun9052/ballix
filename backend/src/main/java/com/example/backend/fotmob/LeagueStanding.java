package com.example.backend.fotmob;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 리그 순위표 한 줄 (조별리그면 groupName으로 구분).
 * 경기 종료 시 해당 대회 순위를 일괄 삭제 후 재삽입한다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "league_standing", indexes = @Index(name = "idx_standing_comp", columnList = "competition_id"))
public class LeagueStanding extends BaseTimeEntity {

    /** ballix 내부 Competition PK. */
    @Column(name = "competition_id", nullable = false)
    private Long competitionId;

    /** 조 이름 (예: "Grp. A"). 단일 리그면 null. */
    @Column(nullable = true)
    private String groupName;

    @Column(name = "rank_no", nullable = true)
    private Integer rankNo;

    @Column(name = "fotmob_team_id", nullable = true)
    private Long fotmobTeamId;

    @Column(nullable = false)
    private String teamName;

    @Column(nullable = true)
    private String crest;

    @Column(nullable = true)
    private Integer played;

    @Column(nullable = true)
    private Integer wins;

    @Column(nullable = true)
    private Integer draws;

    @Column(nullable = true)
    private Integer losses;

    @Column(name = "goal_diff", nullable = true)
    private Integer goalDiff;

    @Column(nullable = true)
    private Integer points;
}
