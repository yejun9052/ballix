package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobMatchResponse.EventDto;
import com.example.backend.fotmob.dto.FotmobMatchResponse.LineupDto;
import com.example.backend.matche.Match;
import com.example.backend.matche.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 매핑된 경기 1건의 FotMob 데이터를 가져와 DB에 반영한다.
 * 라인업·이벤트는 matchId 기준 일괄 삭제 후 재삽입(idempotent)하고,
 * 스코어/status를 갱신하며, 종료된 경기는 최종 확정 처리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FotmobSyncService {

    private final FotmobClient fotmobClient;
    private final MatchRepository matchRepository;
    private final LineupPlayerRepository lineupPlayerRepository;
    private final MatchEventRepository matchEventRepository;
    private final FotmobStandingService standingService;

    @Transactional
    public void syncMatch(Match match) {
        Long fotmobId = match.getFotmobMatchId();
        if (fotmobId == null) {
            return;
        }

        FotmobMatchResponse resp = fotmobClient.getMatch(fotmobId);
        if (resp == null) {
            log.warn("[fotmob-sync] 빈 응답 fotmobId={}", fotmobId);
            return;
        }

        // ── 스코어/status 갱신 ──────────────────────────────
        match.updateScore(
                resp.statusType(),
                resp.homeScore(),
                resp.awayScore(),
                resolveWinner(resp)
        );

        // ── 라인업 저장 (가용할 때만, 평점은 매 폴링 갱신) ────
        if (resp.lineupAvailable() && resp.lineups() != null && !resp.lineups().isEmpty()) {
            lineupPlayerRepository.deleteByMatchId(match.getId());
            lineupPlayerRepository.saveAll(toLineupEntities(match.getId(), resp.lineups()));
            // 선발 라인업이 한 번이라도 저장되면 synced. 평점은 라이브 폴링이 계속 갱신.
            if (!match.isLineupSynced()) {
                match.markLineupSynced();
            }
        }

        // ── 이벤트 저장 (골/카드/교체) ───────────────────────
        if (resp.events() != null) {
            matchEventRepository.deleteByMatchId(match.getId());
            matchEventRepository.saveAll(toEventEntities(match.getId(), resp.events()));
        }

        // ── 종료 처리: 확정 + 리그 순위 갱신 ─────────────────
        if (resp.finished()) {
            match.markFinalized();
            log.info("[fotmob-sync] 최종 확정 fotmobId={} ({} {}-{} {})",
                    fotmobId, resp.homeTeamName(), resp.homeScore(), resp.awayScore(), resp.awayTeamName());
            if (match.getCompetition() != null) {
                try {
                    standingService.syncStandings(match.getCompetition().getId());
                } catch (Exception e) {
                    log.warn("[fotmob-sync] 순위 갱신 실패 competitionId={} : {}",
                            match.getCompetition().getId(), e.getMessage());
                }
            }
        }

        matchRepository.save(match);
    }

    private List<LineupPlayer> toLineupEntities(Long matchId, List<LineupDto> dtos) {
        return dtos.stream()
                .map(d -> LineupPlayer.builder()
                        .matchId(matchId)
                        .fotmobPlayerId(d.playerId())
                        .name(d.name() == null ? "" : d.name())
                        .shirtNumber(d.shirtNumber())
                        .positionId(d.positionId())
                        .home(d.isHome())
                        .starter(d.isStarter())
                        .rating(d.rating())
                        .subInMinute(d.subInMinute())
                        .subOutMinute(d.subOutMinute())
                        .build())
                .toList();
    }

    private List<MatchEvent> toEventEntities(Long matchId, List<EventDto> dtos) {
        return dtos.stream()
                .map(d -> MatchEvent.builder()
                        .matchId(matchId)
                        .type(d.type())
                        .minute(d.minute())
                        .addedTime(d.addedTime())
                        .home(d.isHome())
                        .fotmobPlayerId(d.playerId())
                        .playerName(d.playerName())
                        .detail(d.detail())
                        .build())
                .toList();
    }

    /** FotMob은 winner를 직접 주지 않으므로 종료 시 스코어로 유추. */
    private String resolveWinner(FotmobMatchResponse resp) {
        if (!resp.finished() || resp.homeScore() == null || resp.awayScore() == null) {
            return null;
        }
        int h = resp.homeScore();
        int a = resp.awayScore();
        if (h > a) return "HOME_TEAM";
        if (a > h) return "AWAY_TEAM";
        return "DRAW";
    }
}
