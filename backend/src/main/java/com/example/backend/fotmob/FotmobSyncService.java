package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobMatchResponse.EventDto;
import com.example.backend.fotmob.dto.FotmobMatchResponse.LineupDto;
import com.example.backend.fotmob.lineup.LineupPlayer;
import com.example.backend.fotmob.lineup.LineupPlayerRepository;
import com.example.backend.fotmob.matchevent.MatchEvent;
import com.example.backend.fotmob.matchevent.MatchEventRepository;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.prediction.PredictionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
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
    private final PredictionService predictionService;

    /** 자기 자신의 프록시. HTTP 크롤은 트랜잭션 밖에서, DB 저장만 트랜잭션 안에서(M4·M2 방지).
     *  FotmobScheduleService의 self 패턴과 동일. */
    @Lazy
    @Autowired
    private FotmobSyncService self;

    /** HTTP 크롤 후 트랜잭션 경유 저장. 트랜잭션 없이 호출해야 HTTP-in-tx 커넥션 점유가 없다. */
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
        self.applySyncResult(match.getId(), resp);
    }

    /** 크롤 결과를 DB에 반영(단독 트랜잭션). 최신 엔티티를 재조회해 동시 변경 덮어쓰기 방지. */
    @Transactional
    public void applySyncResult(Long matchId, FotmobMatchResponse resp) {
        Match match = matchRepository.findById(matchId).orElse(null);
        if (match == null) return;

        // ── 스코어/status 갱신 ──────────────────────────────
        match.updateScore(
                resp.statusType(),
                resp.homeScore(),
                resp.awayScore(),
                resolveWinner(resp)
        );
        match.updateLiveIfAbsent(resp.liveTime(), resp.liveSeconds());  // 앵커 없을 때만 1회(재앵커는 11분 시계작업)
        match.updateVenue(resp.venue());                                // 구장 이름(값 있을 때만)

        // ── 라인업 저장 (가용할 때만, 평점은 매 폴링 갱신) ────
        if (resp.lineupAvailable() && resp.lineups() != null && !resp.lineups().isEmpty()) {
            lineupPlayerRepository.deleteByMatchId(matchId);
            lineupPlayerRepository.saveAll(toLineupEntities(matchId, resp.lineups()));
            match.updateFormation(resp.homeFormation(), resp.awayFormation());
            // 선발 라인업이 한 번이라도 저장되면 synced. 평점은 라이브 폴링이 계속 갱신.
            if (!match.isLineupSynced()) {
                match.markLineupSynced();
            }
        }

        // ── 이벤트 저장 (골/카드/교체) ───────────────────────
        if (resp.events() != null) {
            matchEventRepository.deleteByMatchId(matchId);
            matchEventRepository.saveAll(toEventEntities(matchId, resp.events()));
        }

        // ── 종료 처리: 확정 + 리그 순위 갱신 ─────────────────
        if (resp.finished()) {
            match.markFinalized();
            log.info("[fotmob-sync] 최종 확정 fotmobId={} ({} {}-{} {})",
                    match.getFotmobMatchId(), resp.homeTeamName(), resp.homeScore(), resp.awayScore(), resp.awayTeamName());
            if (match.getCompetition() != null) {
                try {
                    standingService.syncStandings(match.getCompetition().getId());
                } catch (Exception e) {
                    log.warn("[fotmob-sync] 순위 갱신 실패 competitionId={} : {}",
                            match.getCompetition().getId(), e.getMessage());
                }
            }
            // 예측 채점 (해당 경기 예측 일괄 채점 + 유저 전적 갱신)
            try {
                predictionService.gradeMatch(match);
            } catch (Exception e) {
                log.warn("[fotmob-sync] 예측 채점 실패 matchId={} : {}", matchId, e.getMessage());
            }
        }

        matchRepository.save(match);
    }

    /**
     * 라이브 시계만 가볍게 갱신 — 스코어/상태/진행시간(앵커)만 저장하고 라인업·이벤트는 건드리지 않는다.
     * HTTP 크롤은 트랜잭션 밖에서, DB 저장만 트랜잭션 안에서.
     */
    public void refreshLiveClock(Match match) {
        if (match.getFotmobMatchId() == null) {
            return;
        }
        FotmobMatchResponse resp = fotmobClient.getMatch(match.getFotmobMatchId());
        if (resp == null) {
            return;
        }
        self.applyLiveClock(match.getId(), resp);
    }

    /** 라이브 시계만 가볍게 반영(단독 트랜잭션). 최신 엔티티 재조회로 덮어쓰기 방지. */
    @Transactional
    public void applyLiveClock(Long matchId, FotmobMatchResponse resp) {
        Match match = matchRepository.findById(matchId).orElse(null);
        if (match == null) return;
        match.updateScore(resp.statusType(), resp.homeScore(), resp.awayScore(), resolveWinner(resp));
        match.updateLive(resp.liveTime(), resp.liveSeconds());
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
                        .posX(d.posX())
                        .posY(d.posY())
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
