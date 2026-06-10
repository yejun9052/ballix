package com.example.backend.prediction;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PredictionRepository extends JpaRepository<Prediction, Long> {

    // 한 유저가 특정 경기에 한 예측 (중복 방지 · 수정용)
    Optional<Prediction> findByUserIdAndMatchId(Long userId, Long matchId);

    // 내 예측 전부 (페이지네이션, 최신순)
    Page<Prediction> findByUserIdOrderByCreateAtDesc(Long userId, Pageable pageable);

    // 특정 경기의 모든 예측 (채점용)
    Optional<List<Prediction>> findByMatchId(Long matchId);
}
