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

    /** 진행 중 경과 시간 표시용 예: "51'". IN_PLAY일 때만 값, 그 외 null. */
    @Column(name = "live_time", nullable = true)
    private String liveTime;

    /** 라이브 시계 앵커 = (폴링시각 - 경과초). 프론트가 (지금 - 이 값)으로 초 단위 시간을 흘린다. */
    @Column(name = "live_started_at", nullable = true)
    private LocalDateTime liveStartedAt;

    /** 구장 이름 (FotMob infoBox.Stadium.name). 경기 상세 동기화 시 채워진다. */
    @Column(name = "venue", nullable = true)
    private String venue;

    /** 라인업 포메이션 예: "4-3-3". 라인업 공개 후 채워진다. */
    @Column(name = "home_formation", nullable = true)
    private String homeFormation;

    @Column(name = "away_formation", nullable = true)
    private String awayFormation;

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

    // ── AI 승률 예측 / 골 요약 (Gemini) ─────────────────────────────────
    /** 관리자가 AI 승률 예측 대상으로 선택했는지. 목록 최상단 정렬 키. */
    @Column(name = "prediction_enabled", nullable = false)
    @Builder.Default
    private boolean predictionEnabled = false;

    /** AI 승률(%) — 홈승/무/원정승. 합 100으로 정규화해 저장. */
    @Column(name = "ai_home_pct", nullable = true)
    private Integer aiHomePct;

    @Column(name = "ai_draw_pct", nullable = true)
    private Integer aiDrawPct;

    @Column(name = "ai_away_pct", nullable = true)
    private Integer aiAwayPct;

    /** AI가 만든 골 내용 요약(경기 종료 후 조회 시 생성). */
    @Column(name = "ai_summary", columnDefinition = "TEXT", nullable = true)
    private String aiSummary;

    @Column(name = "ai_predicted_at", nullable = true)
    private LocalDateTime aiPredictedAt;

    @Column(name = "ai_summary_at", nullable = true)
    private LocalDateTime aiSummaryAt;

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

    /**
     * 폴링 시 진행 시간 갱신. IN_PLAY일 때만 값 유지.
     * liveStartedAt = 지금 - 경과초 → 이후 어느 시점이든 (현재시각 - liveStartedAt)이 경과시간.
     */
    public void updateLive(String liveTime, Integer liveSeconds) {
        if ("IN_PLAY".equals(this.status)) {
            this.liveTime = liveTime;
            if (liveSeconds != null) {
                this.liveStartedAt = LocalDateTime.now().minusSeconds(liveSeconds);
            }
        } else {
            this.liveTime = null;
            this.liveStartedAt = null;
        }
    }

    /**
     * 진행시간 앵커가 아직 없으면 1회만 설정(라이브 진입 즉시 표시용), 이미 있으면 건드리지 않는다
     * — 앵커 재갱신은 별도 시계 작업(11분)이 담당해 잦은 재앵커로 시계가 뒤로 튀는 것을 막는다.
     * IN_PLAY가 아니면(종료/예정) 진행시간을 정리한다.
     */
    public void updateLiveIfAbsent(String liveTime, Integer liveSeconds) {
        if (!"IN_PLAY".equals(this.status)) {
            this.liveTime = null;
            this.liveStartedAt = null;
            return;
        }
        if (this.liveStartedAt == null && liveSeconds != null) {
            this.liveTime = liveTime;
            this.liveStartedAt = LocalDateTime.now().minusSeconds(liveSeconds);
        }
    }

    public void updateFormation(String homeFormation, String awayFormation) {
        if (homeFormation != null) this.homeFormation = homeFormation;
        if (awayFormation != null) this.awayFormation = awayFormation;
    }

    /** 구장 이름 갱신 — 값이 있을 때만(없는 경기에서 기존 값 덮어쓰기 방지). */
    public void updateVenue(String venue) {
        if (venue != null && !venue.isBlank()) this.venue = venue;
    }

    public void markLineupSynced() {
        this.lineupSynced = true;
    }

    public void markFinalized() {
        this.fotmobFinalized = true;
    }

    /** 관리자 선택 + AI 승률 예측 결과 반영(선택 경기는 목록 최상단으로 올라감). */
    public void applyPrediction(int homePct, int drawPct, int awayPct) {
        this.predictionEnabled = true;
        this.aiHomePct = homePct;
        this.aiDrawPct = drawPct;
        this.aiAwayPct = awayPct;
        this.aiPredictedAt = LocalDateTime.now();
    }

    /** AI 골 요약 반영. */
    public void applySummary(String summary) {
        this.aiSummary = summary;
        this.aiSummaryAt = LocalDateTime.now();
    }

    public boolean hasPrediction() {
        return aiPredictedAt != null;
    }

    public boolean hasSummary() {
        return aiSummaryAt != null;
    }
}
