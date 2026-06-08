package com.example.backend.match;

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

    /** FotMob matchId로 경기 조회 (일정 동기화 업서트용). */
    Optional<Match> findByFotmobMatchId(Long fotmobMatchId);

    // ── FotMob 매핑/폴링용 ────────────────────────────────────────────

    /** 아직 FotMob 매핑이 안 된 경기(킥오프가 임박했거나 지난 것). */
    @Query("SELECT m FROM Match m " +
            "WHERE m.fotmobMatchId IS NULL " +
            "AND m.homeTeam IS NOT NULL AND m.awayTeam IS NOT NULL " +
            "AND m.matchTime <= :until")
    List<Match> findUnmappedBefore(@Param("until") LocalDateTime until);

    /**
     * 폴링 대상: 매핑됨 + (라인업 미저장 또는 미확정) + 킥오프가 시간창 안.
     * to=now+window 로 킥오프 전 라인업을 미리 긁고, from=now-과거 로 진행·직후 종료를 커버한다.
     */
    @Query("SELECT m FROM Match m " +
            "WHERE m.fotmobMatchId IS NOT NULL " +
            "AND (m.lineupSynced = false OR m.fotmobFinalized = false) " +
            "AND m.matchTime BETWEEN :from AND :to")
    List<Match> findPollTargets(@Param("from") LocalDateTime from,
                                @Param("to") LocalDateTime to);
}
