package com.example.backend.ai;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * AI 승률 예측의 시점별 스냅샷(히스토리).
 * 관리자가 경기 전 예측을 생성한 경기(predictionEnabled)에 한해, 단계별로 1행씩 쌓인다:
 * <b>phaseMinute</b> = 0(경기 전 초기) / 15·30·45·60·75·90(라이브 갱신, 하프타임 제외).
 * 각 행은 그 시점의 승률·실시간 스코어와 <b>직전 단계 대비 변동 사유</b>(reason)를 담는다.
 * <p>(matchId, phaseMinute) 유니크 — 같은 단계 중복 기록 방지. 폴링/동기화 엔티티처럼 Match와 연관 없이 matchId만 보관.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "ai_prediction_snapshot",
        indexes = @Index(name = "idx_ai_snapshot_match", columnList = "match_id"),
        uniqueConstraints = @UniqueConstraint(name = "uq_ai_snapshot_match_phase", columnNames = {"match_id", "phase_minute"}))
public class AiPredictionSnapshot extends BaseTimeEntity {

    @Column(name = "match_id", nullable = false)
    private Long matchId;

    /** 경과 분 단계: 0=경기 전(초기 예측), 15/30/45/60/75/90=라이브 갱신. */
    @Column(name = "phase_minute", nullable = false)
    private Integer phaseMinute;

    private Integer homePct;
    private Integer drawPct;
    private Integer awayPct;

    /** 스냅샷 시점의 실시간 스코어(경기 전이면 null). */
    private Integer homeScore;
    private Integer awayScore;

    /** 직전 단계 대비 변동 사유(한국어). 경기 전이면 초기 예측 근거. 예: "전반 35분 손흥민 퇴장으로 한국 승률 약 12%p 하락". */
    @Column(columnDefinition = "TEXT")
    private String reason;
}
