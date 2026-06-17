package com.example.backend.match;

import com.example.backend.competition.Competition;
import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.team.Team;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;

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

    /** 전반 추가시간(분). FotMob AddedTime 이벤트(time=45)에서 채워진다. */
    @Column(name = "first_half_added_time", nullable = true)
    private Integer firstHalfAddedTime;

    /** 후반 추가시간(분). FotMob AddedTime 이벤트(time=90)에서 채워진다. */
    @Column(name = "second_half_added_time", nullable = true)
    private Integer secondHalfAddedTime;

    /** 현재 하프 정규시간 끝(전반 45 / 후반 90) — FotMob liveTime.basePeriod. 프론트 추가시간 표기 base(라이브만). */
    @Column(name = "live_base_period", nullable = true)
    private Integer liveBasePeriod;

    /** 현재 하프에 부여된 추가시간(분) — FotMob liveTime.addedTime. "+N" 표시 상한(라이브만). */
    @Column(name = "live_added_time", nullable = true)
    private Integer liveAddedTime;

    /** 라인업 포메이션 예: "4-3-3". 라인업 공개 후 채워진다. */
    @Column(name = "home_formation", nullable = true)
    private String homeFormation;

    @Column(name = "away_formation", nullable = true)
    private String awayFormation;

    /** FotMob 경기 ID. 라인업·평점·이벤트를 가져오기 위한 매핑 키. */
    @Column(name = "fotmob_match_id", nullable = true, unique = true)
    private Long fotmobMatchId;

    /** 경기 다시보기 유튜브 videoId(11자). 종료 경기에 관리자가 등록.
     *  프론트는 https://www.youtube.com/embed/{id} 로 iframe 임베드. */
    @Column(name = "replay_youtube_id", nullable = true)
    private String replayYoutubeId;

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

    /** AI 예상 스코어 — 가장 가능성 높은 결과의 현실적 득점(홈/원정). 승률과 함께 생성. */
    @Column(name = "ai_home_score", nullable = true)
    private Integer aiHomeScore;

    @Column(name = "ai_away_score", nullable = true)
    private Integer aiAwayScore;

    /** AI가 만든 골 내용 요약(경기 종료 후 조회 시 생성). */
    @Column(name = "ai_summary", columnDefinition = "TEXT", nullable = true)
    private String aiSummary;

    @Column(name = "ai_predicted_at", nullable = true)
    private LocalDateTime aiPredictedAt;

    @Column(name = "ai_summary_at", nullable = true)
    private LocalDateTime aiSummaryAt;

    /** 일정 동기화 시 킥오프/단계/상태 갱신 (기존 경기 업데이트용). */
    public void updateSchedule(LocalDateTime matchTime, String stage, String groupName, String status) {
        this.matchTime = matchTime;
        this.stage = stage;
        this.groupName = groupName;
        this.status = status;
    }

    /** 대진 팀 갱신 — 토너먼트 대진 확정 시 미정(예: "Winner SF 1")→실제 팀 반영. 값 있을 때만. */
    public void updateTeams(Team homeTeam, Team awayTeam) {
        if (homeTeam != null) this.homeTeam = homeTeam;
        if (awayTeam != null) this.awayTeam = awayTeam;
    }

    /** 폴링 시 status/스코어 갱신. */
    public void updateScore(String status, Integer homeScore, Integer awayScore, String winner) {
        this.status = status;
        this.homeScore = homeScore;
        this.awayScore = awayScore;
        this.winner = winner;
    }

    /**
     * 라이브 시계 앵커는 KST 벽시계 기준으로 저장한다 — matchTime(UTC+9 변환 저장)과 동일 기준이라야
     * 프론트(KST 브라우저)가 `지금 - liveStartedAt`을 올바로 계산한다. 서버 JVM이 UTC(도커)여도 안전.
     * (이전 `LocalDateTime.now()`는 서버 타임존을 따라 UTC 서버에선 9시간 어긋나 "45+501"처럼 표시됨)
     */
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 기존 앵커가 FotMob 경과초와 이 값(30분)보다 크게 어긋나면 재설정 — 9시간(타임존 오류) 같은 큰 오차만 즉시 교정.
     *  SSR 지연(~10분)은 임계값 아래라 무시 → 잦은 재앵커로 시계가 뒤로 튀는 것을 막는다. */
    private static final long ANCHOR_RESYNC_THRESHOLD_SEC = 1800;

    /**
     * 폴링 시 진행 시간 갱신. IN_PLAY일 때만 값 유지.
     * liveStartedAt = 지금(KST) - 경과초 → 이후 어느 시점이든 (현재시각 - liveStartedAt)이 경과시간.
     */
    public void updateLive(String liveTime, Integer liveSeconds) {
        if ("IN_PLAY".equals(this.status)) {
            this.liveTime = liveTime;
            if (isClockPaused(liveTime)) {
                this.liveStartedAt = null;   // HT 등 정지 구간: 앵커 제거 → 프론트가 라벨만 표시
            } else if (liveSeconds != null) {
                this.liveStartedAt = LocalDateTime.now(KST).minusSeconds(liveSeconds);
            }
        } else {
            this.liveTime = null;
            this.liveStartedAt = null;
        }
    }

    /** "HT"·"Break"·"Pen." 처럼 숫자 없는 라벨 = 시계가 멈추는 구간(하프타임 등). */
    private static boolean isClockPaused(String liveTime) {
        return liveTime != null && liveTime.chars().noneMatch(Character::isDigit);
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
        if (isClockPaused(liveTime)) {
            this.liveTime = liveTime;       // HT 라벨은 갱신하되 앵커는 비워 시계를 멈춘다
            this.liveStartedAt = null;
            return;
        }
        if (liveSeconds == null) {
            return;
        }
        this.liveTime = liveTime;
        // 앵커가 없거나, 기존 앵커가 FotMob 경과초와 크게(>30분) 어긋날 때만 (재)설정.
        // 작은 차이(SSR 지연)는 무시해 시계가 뒤로 튀지 않게 하고, 9시간(타임존 오류) 같은 큰 오차는 즉시 교정.
        if (this.liveStartedAt == null
                || Math.abs(impliedElapsedSeconds() - liveSeconds) > ANCHOR_RESYNC_THRESHOLD_SEC) {
            this.liveStartedAt = LocalDateTime.now(KST).minusSeconds(liveSeconds);
        }
    }

    /** 현재 앵커가 함의하는 경과초 = 지금(KST) - liveStartedAt. (앵커 비정상 여부 판단용) */
    private long impliedElapsedSeconds() {
        return Duration.between(this.liveStartedAt, LocalDateTime.now(KST)).getSeconds();
    }

    /**
     * 라이브 시계 앵커를 **절대 시각(epoch millis, UTC 기준)** 으로도 함께 내려준다.
     * liveStartedAt(KST 벽시계)을 KST로 해석해 변환 → 프론트는 타임존 추측 없이 `Date.now() - liveStartedAtMs`로
     * 경과시간을 계산하면 된다. (LocalDateTime 문자열을 브라우저 로컬로 파싱하던 방식은 KST 아닌 환경에서 9시간 어긋남)
     * 프론트는 이 값을 우선 쓰고, 없으면 기존 `liveStartedAt`로 폴백.
     */
    @Transient
    public Long getLiveStartedAtMs() {
        return liveStartedAt == null ? null : liveStartedAt.atZone(KST).toInstant().toEpochMilli();
    }

    /**
     * **시계가 실제로 흐르는 중인지** — 프론트는 이 값만 보고 시계를 흘릴지(true)/멈출지(false) 결정하면 된다.
     * IN_PLAY이고 앵커가 살아있을 때만 true. **하프타임 등 정지 구간은 앵커가 null이라 false**(`liveTime` 라벨만 표시),
     * 예정/종료도 false. 프론트가 라벨 파싱·null 체크로 추론할 필요 없이 `if (!clockRunning) 멈춤` 한 줄이면 된다.
     */
    @Transient
    public boolean isClockRunning() {
        return "IN_PLAY".equals(this.status) && this.liveStartedAt != null;
    }

    public void updateFormation(String homeFormation, String awayFormation) {
        if (homeFormation != null) this.homeFormation = homeFormation;
        if (awayFormation != null) this.awayFormation = awayFormation;
    }

    /** 구장 이름 갱신 — 값이 있을 때만(없는 경기에서 기존 값 덮어쓰기 방지). */
    public void updateVenue(String venue) {
        if (venue != null && !venue.isBlank()) this.venue = venue;
    }

    /** 전·후반 추가시간 갱신 — 값이 있을 때만(한 번 확정되면 이후 폴링에서 null로 덮이지 않게). */
    public void updateAddedTime(Integer firstHalf, Integer secondHalf) {
        if (firstHalf != null) this.firstHalfAddedTime = firstHalf;
        if (secondHalf != null) this.secondHalfAddedTime = secondHalf;
    }

    /** 현재 하프 base(45/90)·부여 추가시간 갱신 — 프론트 "+N" 표기 기준/상한. IN_PLAY 아니면 정리. */
    public void updateLiveMeta(Integer basePeriod, Integer addedTime) {
        if ("IN_PLAY".equals(this.status)) {
            this.liveBasePeriod = basePeriod;
            this.liveAddedTime = addedTime;
        } else {
            this.liveBasePeriod = null;
            this.liveAddedTime = null;
        }
    }

    public void markLineupSynced() {
        this.lineupSynced = true;
    }

    public void markFinalized() {
        this.fotmobFinalized = true;
    }

    /** 관리자 선택 + AI 승률·예상 스코어 예측 결과 반영(선택 경기는 목록 최상단으로 올라감). */
    public void applyPrediction(int homePct, int drawPct, int awayPct, Integer homeScore, Integer awayScore) {
        this.predictionEnabled = true;
        this.aiHomePct = homePct;
        this.aiDrawPct = drawPct;
        this.aiAwayPct = awayPct;
        this.aiHomeScore = homeScore;
        this.aiAwayScore = awayScore;
        this.aiPredictedAt = LocalDateTime.now();
    }

    /** 다시보기 유튜브 영상 등록(교체 포함). */
    public void applyReplay(String youtubeId) {
        this.replayYoutubeId = youtubeId;
    }

    /** 다시보기 해제. */
    public void clearReplay() {
        this.replayYoutubeId = null;
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
