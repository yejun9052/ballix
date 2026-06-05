package com.example.backend.matche;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MatchRepository extends JpaRepository<Match, Long> {
    @Query("SELECT m FROM Match m " +
            "WHERE FUNCTION('DATE', m.matchTime) = :date " +
            "ORDER BY m.matchTime ASC")
    Optional<List<Match>> findByMatchDate(@Param("date")LocalDate date);

    Optional<List<Match>> findByCompetitionId(Long compId);
}
