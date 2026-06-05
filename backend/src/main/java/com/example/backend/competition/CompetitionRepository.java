package com.example.backend.competition;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CompetitionRepository extends JpaRepository<Competition, Long> {
    Optional<Competition> findByFotmobLeagueId(Long fotmobLeagueId);
}
