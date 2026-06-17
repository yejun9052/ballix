package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobMatchResponse.EventDto;
import com.example.backend.fotmob.dto.FotmobMatchResponse.LineupDto;
import com.example.backend.fotmob.lineup.LineupPlayer;
import com.example.backend.fotmob.lineup.LineupPlayerRepository;
import com.example.backend.fotmob.lineup.PositionResolver;
import com.example.backend.fotmob.player.Player;
import com.example.backend.fotmob.player.PlayerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.backend.fotmob.matchevent.MatchEvent;
import com.example.backend.fotmob.matchevent.MatchEventRepository;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.notify.NtfyClient;
import com.example.backend.prediction.PredictionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

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
    private final PlayerService playerService;
    private final NtfyClient ntfy;

    /** 자기 자신의 프록시. HTTP 크롤은 트랜잭션 밖에서, DB 저장만 트랜잭션 안에서(M4·M2 방지).
     *  FotmobScheduleService의 self 패턴과 동일. */
    @Lazy
    @Autowired
    private FotmobSyncService self;

    /**
     * 같은 경기에 대한 동시 쓰기 직렬화용 스트라이프 락(P1).
     * poll(풀폴링)·liveTick(라이브)·시계갱신이 동시에 같은 match_id에 이벤트/라인업을 delete+saveAll 하면
     * InnoDB 데드락·일시적 깜빡임이 날 수 있어, **트랜잭션 적용만** 같은 락으로 묶어 직렬화한다.
     * HTTP 크롤은 락 밖에서 수행한다(락을 네트워크 I/O 동안 잡지 않음). 스트라이프라 메모리는 고정.
     */
    private static final int LOCK_STRIPES = 32;
    private final Object[] matchLocks = new Object[LOCK_STRIPES];
    { for (int i = 0; i < LOCK_STRIPES; i++) matchLocks[i] = new Object(); }
    private Object lockFor(Long matchId) {
        return matchLocks[Math.floorMod(matchId, LOCK_STRIPES)];
    }

    /**
     * 종료 처리 결과 — 무거운 후속작업(리그 순위 HTTP 크롤·종료 알림)을 트랜잭션 커밋 후로 미루기 위해
     * 필요한 데이터만 담아 반환한다(P2: HTTP-in-transaction 방지).
     */
    // package-private — public @Transactional 메서드의 반환 타입이라 CGLIB 프록시(같은 패키지)가 참조 가능해야 함(private 금지).
    record FinalizeOutcome(boolean finalized, boolean firstFinalize, Long competitionId,
                           String homeTeamName, Integer homeScore, Integer awayScore, String awayTeamName) {
        static FinalizeOutcome none() {
            return new FinalizeOutcome(false, false, null, null, null, null, null);
        }
    }

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
        FinalizeOutcome outcome;
        synchronized (lockFor(match.getId())) {     // 같은 경기 동시 쓰기 직렬화(P1)
            outcome = self.applySyncResult(match.getId(), resp);
        }
        runPostFinalize(outcome);                   // 순위 크롤·알림은 커밋 후·락 밖(P2)
    }

    /** 크롤 결과를 DB에 반영(단독 트랜잭션). 최신 엔티티를 재조회해 동시 변경 덮어쓰기 방지. */
    @Transactional
    public FinalizeOutcome applySyncResult(Long matchId, FotmobMatchResponse resp) {
        Match match = matchRepository.findById(matchId).orElse(null);
        if (match == null) return FinalizeOutcome.none();

        // ── 스코어/status 갱신 ──────────────────────────────
        match.updateScore(
                resp.statusType(),
                resp.homeScore(),
                resp.awayScore(),
                resolveWinner(resp)
        );
        match.updateLiveIfAbsent(resp.liveTime(), resp.liveSeconds());  // 앵커 없을 때만 1회(재앵커는 11분 시계작업)
        match.updateVenue(resp.venue());                                // 구장 이름(값 있을 때만)
        match.updateAddedTime(resp.firstHalfAddedTime(), resp.secondHalfAddedTime());  // 전·후반 추가시간(값 있을 때만)
        match.updateLiveMeta(resp.liveBasePeriod(), resp.liveAddedTime());             // 현재 하프 base(45/90)·부여 추가시간

        // ── 라인업 저장 (가용할 때만, 평점은 매 폴링 갱신) ────
        if (resp.lineupAvailable() && resp.lineups() != null && !resp.lineups().isEmpty()) {
            lineupPlayerRepository.deleteByMatchId(matchId);
            lineupPlayerRepository.saveAll(toLineupEntities(match, resp.lineups()));
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

        // ── 종료 처리: 확정 + 채점(DB) ─ 순위 크롤·알림은 커밋 후로 ──
        FinalizeOutcome outcome = finalizeIfFinished(match, resp);

        matchRepository.save(match);
        return outcome;
    }

    /**
     * 종료 감지 시 확정 처리 — markFinalized + 예측 채점(DB)만 트랜잭션 안에서 한다.
     * 무거운 HTTP(리그 순위 크롤)·종료 알림(ntfy)은 `FinalizeOutcome`으로 넘겨 **커밋 후** `runPostFinalize`에서 수행한다(P2).
     * `applySyncResult`(풀폴링)와 `applyLiveSync`(라이브 폴링)가 공유한다. 같은 트랜잭션 안에서 호출.
     */
    private FinalizeOutcome finalizeIfFinished(Match match, FotmobMatchResponse resp) {
        if (!resp.finished()) {
            return FinalizeOutcome.none();
        }
        boolean firstFinalize = !match.isFotmobFinalized();   // 첫 종료 감지 시에만 알림(폴링 중복 방지)
        match.markFinalized();
        log.info("[fotmob-sync] 최종 확정 fotmobId={} ({} {}-{} {})",
                match.getFotmobMatchId(), resp.homeTeamName(), resp.homeScore(), resp.awayScore(), resp.awayTeamName());
        // 예측 채점은 DB 작업이라 종료 확정과 같은 트랜잭션에서 원자적으로(적중/유저전적 갱신).
        try {
            predictionService.gradeMatch(match);
        } catch (Exception e) {
            log.warn("[fotmob-sync] 예측 채점 실패 matchId={} : {}", match.getId(), e.getMessage());
        }
        Long compId = match.getCompetition() != null ? match.getCompetition().getId() : null;
        return new FinalizeOutcome(true, firstFinalize, compId,
                resp.homeTeamName(), resp.homeScore(), resp.awayScore(), resp.awayTeamName());
    }

    /**
     * 종료 후속작업 — 트랜잭션 커밋 후·매치 락 밖에서 종료 알림(ntfy)과 리그 순위 갱신(HTTP 크롤)을 수행한다.
     * 순위 크롤이 DB 커넥션을 잡은 채 네트워크 I/O 하지 않도록(HTTP-in-transaction 방지) 분리했다.
     */
    private void runPostFinalize(FinalizeOutcome fo) {
        if (fo == null || !fo.finalized()) {
            return;
        }
        if (fo.firstFinalize()) {
            ntfy.send("Full Time",
                    String.format("%s %s-%s %s 경기 종료",
                            fo.homeTeamName(), nz(fo.homeScore()), nz(fo.awayScore()), fo.awayTeamName()),
                    "checkered_flag");
        }
        if (fo.competitionId() != null) {
            try {
                standingService.syncStandings(fo.competitionId());
            } catch (Exception e) {
                log.warn("[fotmob-sync] 순위 갱신 실패 competitionId={} : {}", fo.competitionId(), e.getMessage());
            }
        }
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
        synchronized (lockFor(match.getId())) {     // 같은 경기 동시 쓰기 직렬화(P1)
            self.applyLiveClock(match.getId(), resp);
        }
    }

    /** 알림 표시용: null 스코어를 "-"로. */
    private String nz(Integer v) {
        return v == null ? "-" : v.toString();
    }

    /** 라이브 시계만 가볍게 반영(단독 트랜잭션). 최신 엔티티 재조회로 덮어쓰기 방지. */
    @Transactional
    public void applyLiveClock(Long matchId, FotmobMatchResponse resp) {
        Match match = matchRepository.findById(matchId).orElse(null);
        if (match == null) return;
        match.updateScore(resp.statusType(), resp.homeScore(), resp.awayScore(), resolveWinner(resp));
        match.updateLive(resp.liveTime(), resp.liveSeconds());
        match.updateAddedTime(resp.firstHalfAddedTime(), resp.secondHalfAddedTime());
        match.updateLiveMeta(resp.liveBasePeriod(), resp.liveAddedTime());
        matchRepository.save(match);
    }

    /**
     * 라이브 빠른 동기화 — 진행 중 경기의 **이벤트·스코어·status·하프타임/종료**를 짧은 주기(초 단위)로 즉시 반영한다.
     * HT/FT/골이 풀폴링(분 단위)보다 빨리 뜨게 하는 게 목적. HTTP 크롤은 트랜잭션 밖에서.
     *
     * 시계 앵커는 `updateLiveIfAbsent`로 **1회만 설정**(재앵커 X) — SSR이 몇 분 지연돼 잦은 재앵커는 시계를
     * 뒤로 스냅하므로, 흐르는 시계는 프론트가 앵커에서 계산하고 드리프트 보정은 11분 `refreshLiveClock`이 맡는다.
     * 단 HT 라벨/앵커정리는 `updateLiveIfAbsent`가 매번 처리하므로 하프타임은 이 빠른 주기로 즉시 반영된다.
     */
    public void syncLive(Match match) {
        if (match.getFotmobMatchId() == null) {
            return;
        }
        FotmobMatchResponse resp = fotmobClient.getMatch(match.getFotmobMatchId());
        if (resp == null) {
            return;
        }
        FinalizeOutcome outcome;
        synchronized (lockFor(match.getId())) {     // 같은 경기 동시 쓰기 직렬화(P1)
            outcome = self.applyLiveSync(match.getId(), resp);
        }
        runPostFinalize(outcome);                   // 순위 크롤·알림은 커밋 후·락 밖(P2)
    }

    /** 라이브 빠른 동기화 반영(단독 트랜잭션) — 이벤트·스코어·status·HT/FT. 라인업은 아직 없을 때만 채운다. */
    @Transactional
    public FinalizeOutcome applyLiveSync(Long matchId, FotmobMatchResponse resp) {
        Match match = matchRepository.findById(matchId).orElse(null);
        if (match == null) return FinalizeOutcome.none();

        match.updateScore(resp.statusType(), resp.homeScore(), resp.awayScore(), resolveWinner(resp));
        match.updateLiveIfAbsent(resp.liveTime(), resp.liveSeconds());   // 앵커 1회만(재앵커는 11분 작업) + HT 라벨/정리
        match.updateAddedTime(resp.firstHalfAddedTime(), resp.secondHalfAddedTime());
        match.updateLiveMeta(resp.liveBasePeriod(), resp.liveAddedTime());

        // 이벤트(골/카드/교체) 즉시 반영 — 라인업/평점은 풀폴링이 담당해 라이브 폴링을 가볍게 유지
        if (resp.events() != null) {
            matchEventRepository.deleteByMatchId(matchId);
            matchEventRepository.saveAll(toEventEntities(matchId, resp.events()));
        }

        // 킥오프 직후 라인업이 아직 없으면 한 번은 채워준다(이후 평점 갱신은 풀폴링)
        if (!match.isLineupSynced() && resp.lineupAvailable()
                && resp.lineups() != null && !resp.lineups().isEmpty()) {
            lineupPlayerRepository.deleteByMatchId(matchId);
            lineupPlayerRepository.saveAll(toLineupEntities(match, resp.lineups()));
            match.updateFormation(resp.homeFormation(), resp.awayFormation());
            match.markLineupSynced();
        }

        FinalizeOutcome outcome = finalizeIfFinished(match, resp);   // 종료 즉시 확정/채점(순위·알림은 커밋 후)
        matchRepository.save(match);
        return outcome;
    }

    private List<LineupPlayer> toLineupEntities(Match match, List<LineupDto> dtos) {
        Long matchId = match.getId();
        // 선수(식별·소속)를 먼저 업서트하고 fotmobPlayerId→Player 맵을 받아 FK로 연결한다.
        Map<Long, Player> players = playerService.upsertBasicForLineup(match, dtos);
        return dtos.stream()
                // playerId 없는 항목은 키가 없어 Player를 만들 수 없으므로 건너뜀(드문 소규모 친선 케이스).
                .filter(d -> d.playerId() != null && players.containsKey(d.playerId()))
                .map(d -> LineupPlayer.builder()
                        .matchId(matchId)
                        .player(players.get(d.playerId()))
                        .shirtNumber(d.shirtNumber())
                        .positionId(d.positionId())
                        .position(PositionResolver.resolve(d.positionId(), d.posX(), d.posY(), d.isHome()))
                        .posX(d.posX())
                        .posY(d.posY())
                        .home(d.isHome())
                        .starter(d.isStarter())
                        .rating(d.rating())
                        .subInMinute(d.subInMinute())
                        .subOutMinute(d.subOutMinute())
                        .matchStatsJson(writeMatchStats(d.matchStats()))
                        .build())
                .toList();
    }

    /** 경기별 선수 스탯 리스트를 JSON 문자열로 직렬화(저장용). 비면 null. */
    private static final ObjectMapper MATCH_STATS_MAPPER = new ObjectMapper();

    private static String writeMatchStats(List<?> matchStats) {
        if (matchStats == null || matchStats.isEmpty()) return null;
        try {
            return MATCH_STATS_MAPPER.writeValueAsString(matchStats);
        } catch (Exception e) {
            return null;
        }
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
