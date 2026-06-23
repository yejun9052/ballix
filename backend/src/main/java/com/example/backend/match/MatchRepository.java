package com.example.backend.match;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
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
    @EntityGraph(attributePaths = {"homeTeam", "awayTeam", "competition"})
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
    @EntityGraph(attributePaths = {"homeTeam", "awayTeam", "competition"})
    Page<Match> findByMatchDate(@Param("date") LocalDate date, Pageable pageable);

    /** 해당 날짜에 경기가 있는지(lazy-crawl 게이트용 — 페이징과 무관). */
    @Query("SELECT COUNT(m) > 0 FROM Match m WHERE FUNCTION('DATE', m.matchTime) = :date")
    boolean existsByMatchDate(@Param("date") LocalDate date);

    /** 특정 대회 경기: IN_PLAY 먼저, 그 뒤 matchTime ASC. */
    @Query("SELECT m FROM Match m WHERE m.competition.id = :compId " +
            "ORDER BY CASE WHEN m.status = 'IN_PLAY' THEN 0 ELSE 1 END ASC, m.matchTime ASC")
    @EntityGraph(attributePaths = {"homeTeam", "awayTeam", "competition"})
    Page<Match> findByCompetitionId(@Param("compId") Long compId, Pageable pageable);

    /** 다가오는 경기(킥오프 미래), 가까운 순. */
    @EntityGraph(attributePaths = {"homeTeam", "awayTeam", "competition"})
    Page<Match> findByMatchTimeAfterOrderByMatchTimeAsc(LocalDateTime now, Pageable pageable);

    /** 다가오는 경기 - 특정 대회만. */
    @EntityGraph(attributePaths = {"homeTeam", "awayTeam", "competition"})
    Page<Match> findByMatchTimeAfterAndCompetitionIdOrderByMatchTimeAsc(LocalDateTime now, Long compId, Pageable pageable);

    /**
     * 팀 이름으로 경기 검색(관리자 UI에서 matchId 대신 팀명으로 찾기용).
     * 홈/원정 팀의 영문명(name)·한국어명(nameKo) 모두에 부분일치(대소문자 무시) — 한글/영어 둘 다 검색 가능.
     * status 주면 해당 상태만. 최신 경기 먼저.
     */
    @Query("SELECT m FROM Match m " +
            "WHERE (:status IS NULL OR m.status = :status) " +
            "AND (LOWER(m.homeTeam.name) LIKE LOWER(CONCAT('%', :q, '%')) " +
            "  OR LOWER(m.awayTeam.name) LIKE LOWER(CONCAT('%', :q, '%')) " +
            "  OR LOWER(m.homeTeam.nameKo) LIKE LOWER(CONCAT('%', :q, '%')) " +
            "  OR LOWER(m.awayTeam.nameKo) LIKE LOWER(CONCAT('%', :q, '%'))) " +
            "ORDER BY m.matchTime DESC")
    @EntityGraph(attributePaths = {"homeTeam", "awayTeam", "competition"})
    Page<Match> searchByTeamName(@Param("q") String q,
                                 @Param("status") String status,
                                 Pageable pageable);

    /** FotMob matchId로 경기 조회 (일정 동기화 업서트용). */
    Optional<Match> findByFotmobMatchId(Long fotmobMatchId);

    /** 진행 중 경기(라이브 시계 1분 갱신용). */
    List<Match> findByStatusAndFotmobMatchIdIsNotNull(String status);

    /** 실시간 AI 승률 갱신 대상: AI 예측 켜진 + 진행 중 경기. */
    List<Match> findByStatusAndPredictionEnabledTrue(String status);

    /** AI 유저 참가 백필 대상: AI 승률 켜진 + 아직 시작 안 한(킥오프 미래) 경기. */
    List<Match> findByPredictionEnabledTrueAndMatchTimeAfter(LocalDateTime now);

    /** 특정 상태 + 킥오프가 [from, to] 사이인 경기 (ntfy 시작 임박 알림용). */
    List<Match> findByStatusAndMatchTimeBetween(String status, LocalDateTime from, LocalDateTime to);

    // ── FotMob 폴링용 ─────────────────────────────────────────────────

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

    /**
     * 상세(라인업·이벤트) 일괄 보강 대상: 시작된(IN_PLAY/FINISHED) 경기 중 라인업이 아직 저장 안 된 것.
     * 과거 일정 동기화 때 스코어만 들어오고 상세 크롤이 실패해 비어 있는 경기를 최근순으로 골라낸다.
     * since 로 너무 오래된 경기는 제외하고, Pageable 로 한 번에 처리할 건수를 제한한다.
     */
    @Query("SELECT m FROM Match m " +
            "WHERE m.fotmobMatchId IS NOT NULL " +
            "AND m.lineupSynced = false " +
            "AND m.status IN ('IN_PLAY', 'FINISHED') " +
            "AND m.matchTime >= :since " +
            "ORDER BY m.matchTime DESC")
    List<Match> findDetailBackfillTargets(@Param("since") LocalDateTime since, Pageable pageable);
}
