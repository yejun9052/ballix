package com.example.backend.fotmob.lineup;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LineupPlayerRepository extends JpaRepository<LineupPlayer, Long> {

    // 내부용(getView·동기화): 전체 라인업이 필요
    List<LineupPlayer> findByMatchId(Long matchId);

    // 엔드포인트용: 페이지네이션
    Page<LineupPlayer> findByMatchId(Long matchId, Pageable pageable);

    void deleteByMatchId(Long matchId);
}
