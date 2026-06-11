package com.example.backend.match;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MatchRepository extends JpaRepository<Match, Long> {

    /** 전체 경기: IN_PLAY 최상단(matchTime ASC), 그 다음 AI 예측 선택 경기, 그 뒤 matchTime ASC. */
    @Query("SELECT m FROM Match m ORDER BY " +
            "CASE WHEN m.status = 'IN_PLAY' THEN 0 ELSE 1 END ASC, " +
            "m.predictionEnabled DESC, " +
            "m.matchTime ASC")
    Page<Match> findAllSorted(Pageable pageable);

    /** 특정 팀의 최근 종료 경기(폼) — 킥오프 이전, 최신순. Pageable로 N건 제한. */
    @Query("SELECT m FROM Match m " +
            "WHERE (m.homeTeam.id = :teamId OR m.awayTeam.id = :teamId) " +
            "AND m.status = 'FINISHED' AND m.matchTime < :before " +
            "ORDER BY m.matchTime DESC")
    List<Match> findRecentForm(@Param("teamId") Long teamId,
                               @Param("before") LocalDateTime before,
                               Pageable pageable);

    /** 해당 날짜의 경기(페이지): IN_PLAY 먼저, 그 뒤 matchTime ASC. */
    @Query("SELECT m FROM Match m " +
            "WHERE FUNCTION('DATE', m.matchTime) = :date " +
            "ORDER BY CASE WHEN m.status = 'IN_PLAY' THEN 0 ELSE 1 END ASC, m.matchTime ASC")
    Page<Match> findByMatchDate(@Param("date") LocalDate date, Pageable pageable);

    /** 해당 날짜에 경기가 있는지(lazy-crawl 게이트용 — 페이징과 무관). */
    @Query("SELECT COUNT(m) > 0 FROM Match m WHERE FUNCTION('DATE', m.matchTime) = :date")
    boolean existsByMatchDate(@Param("date") LocalDate date);

    /** 특정 대회 경기: IN_PLAY 먼저, 그 뒤 matchTime ASC. */
    @Query("SELECT m FROM Match m WHERE m.competition.id = :compId " +
            "ORDER BY CASE WHEN m.status = 'IN_PLAY' THEN 0 ELSE 1 END ASC, m.matchTime ASC")
    Page<Match> findByCompetitionId(@Param("compId") Long compId, Pageable pageable);

    /** 다가오는 경기(킥오프 미래), 가까운 순. */
    Page<Match> findByMatchTimeAfterOrderByMatchTimeAsc(LocalDateTime now, Pageable pageable);

    /** 다가오는 경기 - 특정 대회만. */
    Page<Match> findByMatchTimeAfterAndCompetitionIdOrderByMatchTimeAsc(LocalDateTime now, Long compId, Pageable pageable);

    /** FotMob matchId로 경기 조회 (일정 동기화 업서트용). */
    Optional<Match> findByFotmobMatchId(Long fotmobMatchId);

    /** 진행 중 경기(라이브 시계 1분 갱신용). */
    List<Match> findByStatusAndFotmobMatchIdIsNotNull(String status);

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
