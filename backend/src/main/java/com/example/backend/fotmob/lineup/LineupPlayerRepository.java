package com.example.backend.fotmob.lineup;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LineupPlayerRepository extends JpaRepository<LineupPlayer, Long> {

    List<LineupPlayer> findByMatchId(Long matchId);

    void deleteByMatchId(Long matchId);
}
