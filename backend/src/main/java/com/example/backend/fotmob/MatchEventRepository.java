package com.example.backend.fotmob;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MatchEventRepository extends JpaRepository<MatchEvent, Long> {

    List<MatchEvent> findByMatchIdOrderByMinuteAsc(Long matchId);

    void deleteByMatchId(Long matchId);
}
