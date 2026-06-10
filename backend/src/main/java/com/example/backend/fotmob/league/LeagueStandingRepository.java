package com.example.backend.fotmob.league;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeagueStandingRepository extends JpaRepository<LeagueStanding, Long> {

    // 내부용(AI 다이제스트·lazy 게이트): 전체 순위가 필요
    List<LeagueStanding> findByCompetitionIdOrderByGroupNameAscRankNoAsc(Long competitionId);

    // 엔드포인트용: 페이지네이션
    Page<LeagueStanding> findByCompetitionIdOrderByGroupNameAscRankNoAsc(Long competitionId, Pageable pageable);

    void deleteByCompetitionId(Long competitionId);
}
