package com.example.backend.match;

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

    /** FotMob 경기 ID. 라인업·평점·이벤트를 가져오기 위한 매핑 키. */
    @Column(name = "fotmob_match_id", nullable = true, unique = true)
    private Long fotmobMatchId;

    /** 라인업이 DB에 저장 완료되었는지(선발은 1회 저장 후 불변). */
    @Column(name = "lineup_synced", nullable = false)
    @Builder.Default
    private boolean lineupSynced = false;

    /** 경기 종료 후 평점·이벤트 최종 확정 저장이 끝났는지. */
    @Column(name = "fotmob_finalized", nullable = false)
    @Builder.Default
    private boolean fotmobFinalized = false;

    /** 팀명+날짜 검색으로 확보한 FotMob matchId를 연결한다. */
    public void linkFotmob(Long fotmobMatchId) {
        this.fotmobMatchId = fotmobMatchId;
    }

    /** 일정 동기화 시 킥오프/단계/상태 갱신 (기존 경기 업데이트용). */
    public void updateSchedule(LocalDateTime matchTime, String stage, String groupName, String status) {
        this.matchTime = matchTime;
        this.stage = stage;
        this.groupName = groupName;
        this.status = status;
    }

    /** 폴링 시 status/스코어 갱신. */
    public void updateScore(String status, Integer homeScore, Integer awayScore, String winner) {
        this.status = status;
        this.homeScore = homeScore;
        this.awayScore = awayScore;
        this.winner = winner;
    }

    public void markLineupSynced() {
        this.lineupSynced = true;
    }

    public void markFinalized() {
        this.fotmobFinalized = true;
    }
}
