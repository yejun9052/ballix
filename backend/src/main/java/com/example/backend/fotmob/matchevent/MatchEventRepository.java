package com.example.backend.fotmob.matchevent;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MatchEventRepository extends JpaRepository<MatchEvent, Long> {

    // 내부용(getView·요약): 전체 이벤트가 필요
    List<MatchEvent> findByMatchIdOrderByMinuteAsc(Long matchId);

    // 엔드포인트용: 페이지네이션
    Page<MatchEvent> findByMatchIdOrderByMinuteAsc(Long matchId, Pageable pageable);

    void deleteByMatchId(Long matchId);
}
