package com.example.backend.ai;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiPredictionSnapshotRepository extends JpaRepository<AiPredictionSnapshot, Long> {

    /** 한 경기의 단계별 히스토리(경기 전 → 90분 순). */
    List<AiPredictionSnapshot> findByMatchIdOrderByPhaseMinuteAsc(Long matchId);

    /** 같은 단계가 이미 기록됐는지(라이브 중복 방지). */
    boolean existsByMatchIdAndPhaseMinute(Long matchId, Integer phaseMinute);

    /** 경기 전 예측 (재)생성 시 히스토리 초기화용. */
    void deleteByMatchId(Long matchId);
}
