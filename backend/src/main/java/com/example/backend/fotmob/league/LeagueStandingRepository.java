package com.example.backend.fotmob.league;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeagueStandingRepository extends JpaRepository<LeagueStanding, Long> {

    List<LeagueStanding> findByCompetitionIdOrderByGroupNameAscRankNoAsc(Long competitionId);

    void deleteByCompetitionId(Long competitionId);
}
