package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobPlayerStatsResponse;
import com.example.backend.fotmob.dto.FotmobPlayerStatsResponse.Item;
import com.example.backend.fotmob.playerstat.PlayerStat;
import com.example.backend.fotmob.playerstat.PlayerStatRepository;
import com.example.backend.fotmob.playerstat.PlayerStatView;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 리그 개인 기록(득점왕/도움왕)을 FotMob에서 가져와 캐시한다.
 * 안정적인 {@code fotmobLeagueId}(예: 월드컵 77)로 키잉하고, 갱신 시 리그 단위 일괄 삭제 후 재삽입한다.
 *
 * DB-first lazy + TTL: 비어있거나 마지막 저장이 {@link #TTL_HOURS}시간보다 오래됐으면 1회 크롤+저장,
 * 그 외엔 DB만 읽는다(경기 결과로 기록이 바뀌므로 무기한 캐시는 부적절). {@link FotmobStandingService}와 같은 패턴.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FotmobPlayerStatService {

    private static final String GOALS = "GOALS";
    private static final String ASSISTS = "ASSISTS";
    /** 캐시 신선도(시간) — 이보다 오래되면 다음 조회 시 재크롤. */
    private static final long TTL_HOURS = 3;

    private final FotmobClient fotmobClient;
    private final PlayerStatRepository playerStatRepository;

    /** 엔드포인트용: 득점왕/도움왕 묶음. 비었거나 오래됐으면 1회 lazy 크롤. */
    @Transactional
    public PlayerStatView.Board getBoard(Long fotmobLeagueId) {
        if (isStale(fotmobLeagueId)) {
            try {
                syncPlayerStats(fotmobLeagueId);
            } catch (Exception e) {
                log.warn("[fotmob-playerstat] lazy 동기화 실패 leagueId={} : {}", fotmobLeagueId, e.getMessage());
            }
        }
        List<PlayerStatView> scorers = playerStatRepository
                .findByFotmobLeagueIdAndStatTypeOrderByRankNoAsc(fotmobLeagueId, GOALS)
                .stream().map(PlayerStatView::from).toList();
        List<PlayerStatView> assists = playerStatRepository
                .findByFotmobLeagueIdAndStatTypeOrderByRankNoAsc(fotmobLeagueId, ASSISTS)
                .stream().map(PlayerStatView::from).toList();
        return new PlayerStatView.Board(scorers, assists);
    }

    /** DB가 비어있거나 마지막 저장이 TTL을 넘었으면 true. */
    private boolean isStale(Long fotmobLeagueId) {
        return playerStatRepository.findFirstByFotmobLeagueIdOrderByCreateAtDesc(fotmobLeagueId)
                .map(s -> s.getCreateAt() == null
                        || Duration.between(s.getCreateAt(), LocalDateTime.now()).toHours() >= TTL_HOURS)
                .orElse(true);   // 비어있음 → 크롤 필요
    }

    /** FotMob 크롤 후 리그 단위 일괄 교체. */
    @Transactional
    public void syncPlayerStats(Long fotmobLeagueId) {
        FotmobPlayerStatsResponse resp = fotmobClient.getPlayerStats(fotmobLeagueId);
        if (resp == null) {
            return;
        }
        List<PlayerStat> rows = new ArrayList<>();
        addRows(rows, fotmobLeagueId, GOALS, resp.scorers());
        addRows(rows, fotmobLeagueId, ASSISTS, resp.assists());
        if (rows.isEmpty()) {
            return;   // 빈 응답이면 기존 캐시 유지(덮어쓰지 않음)
        }
        playerStatRepository.deleteByFotmobLeagueId(fotmobLeagueId);
        playerStatRepository.saveAll(rows);
        log.info("[fotmob-playerstat] leagueId={} 개인기록 갱신 (득점왕 {} 도움왕 {})",
                fotmobLeagueId, resp.scorers() == null ? 0 : resp.scorers().size(),
                resp.assists() == null ? 0 : resp.assists().size());
    }

    private void addRows(List<PlayerStat> rows, Long leagueId, String statType, List<Item> items) {
        if (items == null) return;
        for (Item it : items) {
            rows.add(PlayerStat.builder()
                    .fotmobLeagueId(leagueId)
                    .statType(statType)
                    .rankNo(it.rank())
                    .fotmobPlayerId(it.playerId())
                    .playerName(it.name() == null ? "" : it.name())
                    .fotmobTeamId(it.teamId())
                    .teamName(it.teamName())
                    .countryCode(it.countryCode())
                    .statValue(it.value())
                    .matchesPlayed(it.matchesPlayed())
                    .build());
        }
    }
}
