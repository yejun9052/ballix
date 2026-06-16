package com.example.backend.prediction;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PredictionRepository extends JpaRepository<Prediction, Long> {

    // 한 유저가 특정 경기에 한 예측 (중복 방지 · 수정용)
    Optional<Prediction> findByUserIdAndMatchId(Long userId, Long matchId);

    // 내 예측 전부 (페이지네이션, 최신순)
    Page<Prediction> findByUserIdOrderByCreateAtDesc(Long userId, Pageable pageable);

    // 특정 경기의 모든 예측 (채점용)
    Optional<List<Prediction>> findByMatchId(Long matchId);

    /**
     * 채점 전용: 해당 경기 예측 행을 비관적 쓰기락으로 잠그고 읽는다.
     * 폴링 스케줄러와 관리자 수동 동기화가 같은 경기를 동시에 채점할 때
     * 한쪽이 끝날 때까지 다른 쪽이 대기 → 잠긴 뒤엔 최신 커밋(isGraded=true)을 보고 중복 집계를 막는다.
     * (락 읽기는 스냅샷이 아닌 최신 커밋을 읽으므로 MySQL REPEATABLE READ에서도 안전)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Prediction p WHERE p.match.id = :matchId")
    List<Prediction> findByMatchIdForUpdate(@Param("matchId") Long matchId);
}
