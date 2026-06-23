package com.example.backend.fotmob.playerstat;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlayerStatRepository extends JpaRepository<PlayerStat, Long> {

    /** 리그 전체 기록 (종류 → 순위 순). */
    List<PlayerStat> findByFotmobLeagueIdOrderByStatTypeAscRankNoAsc(Long fotmobLeagueId);

    /** 특정 종류(GOALS/ASSISTS) 기록 (순위 순). */
    List<PlayerStat> findByFotmobLeagueIdAndStatTypeOrderByRankNoAsc(Long fotmobLeagueId, String statType);

    /** 신선도(TTL) 판단용 — 마지막 저장 시각. */
    Optional<PlayerStat> findFirstByFotmobLeagueIdOrderByCreateAtDesc(Long fotmobLeagueId);

    void deleteByFotmobLeagueId(Long fotmobLeagueId);
}
