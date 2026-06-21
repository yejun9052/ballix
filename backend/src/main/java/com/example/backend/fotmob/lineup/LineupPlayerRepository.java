package com.example.backend.fotmob.lineup;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LineupPlayerRepository extends JpaRepository<LineupPlayer, Long> {

    // 내부용(getView·동기화): 전체 라인업이 필요.
    // player를 LEFT JOIN FETCH로 함께 로드 — 직렬화 시 선수 이름/ID를 LAZY로 1명씩 읽던 N+1 제거(상세 조회 가속).
    @Query("select lp from LineupPlayer lp left join fetch lp.player where lp.matchId = :matchId")
    List<LineupPlayer> findByMatchId(@Param("matchId") Long matchId);

    // 엔드포인트용: 페이지네이션
    Page<LineupPlayer> findByMatchId(Long matchId, Pageable pageable);

    void deleteByMatchId(Long matchId);
}
