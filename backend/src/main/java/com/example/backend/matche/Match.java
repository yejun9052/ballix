package com.example.backend.matche;

import com.example.backend.competition.Competition;
import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.team.Team;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "matches")
public class Match extends BaseTimeEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "competition_id", nullable = false)
    private Competition competition;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "home_team_id")
    private Team homeTeam;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "away_team_id")
    private Team awayTeam;

    @Column(nullable = false)
    private LocalDateTime matchTime;

    @Column(nullable = true)
    private String stage;

    @Column(name = "group_name", nullable = true)
    private String groupName;

    @Column(nullable = true)
    private Integer matchday;

    @Column(nullable = false)
    private String status;

    @Column(nullable = true)
    private Integer homeScore;

    @Column(nullable = true)
    private Integer awayScore;

    @Column(nullable = true)
    private String winner;
}
