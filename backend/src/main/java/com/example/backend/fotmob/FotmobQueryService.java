package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.MatchFotmobView;
import com.example.backend.fotmob.lineup.LineupPlayer;
import com.example.backend.fotmob.lineup.LineupPlayerRepository;
import com.example.backend.fotmob.matchevent.MatchEvent;
import com.example.backend.fotmob.matchevent.MatchEventRepository;
import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class FotmobQueryService {

    private final MatchRepository matchRepository;
    private final LineupPlayerRepository lineupPlayerRepository;
    private final MatchEventRepository matchEventRepository;
    private final FotmobSyncService syncService;

    // 라인업이 공개되기 시작하는 킥오프 전 시간창(분). 이보다 더 미래면 lazy 크롤을 안 한다.
    private static final long LINEUP_LAZY_WINDOW_MINUTES = 60;
    // lazy 크롤 쿨다운: 연속 요청이 매번 크롤을 유발하지 않도록 N분 내 재크롤 억제
    private static final long LAZY_CRAWL_COOLDOWN_MINUTES = 3;

    /** matchId → 마지막 lazy 크롤 시각 (쿨다운용, 폴링 스케줄러 lastPolled 패턴과 동일). */
    private final Map<Long, LocalDateTime> lastLazyCrawled = new ConcurrentHashMap<>();

    /** 현재 lazy 크롤이 진행 중인 matchId 집합 (single-flight: 동시 첫 조회 중복 크롤 방지). */
    private final Set<Long> inFlight = ConcurrentHashMap.newKeySet();

    public Page<LineupPlayer> getLineup(Long matchId, Pageable pageable) {
        matchRepository.findById(matchId).ifPresent(this::lazySync);
        return lineupPlayerRepository.findByMatchId(matchId, pageable);
    }

    public Page<MatchEvent> getEvents(Long matchId, Pageable pageable) {
        matchRepository.findById(matchId).ifPresent(this::lazySync);
        return matchEventRepository.findByMatchIdOrderByMinuteAsc(matchId, pageable);
    }

    public MatchFotmobView getView(Long matchId) {
        Match match = findMatch(matchId);
        if (!match.isLineupSynced()) {
            lazySync(match);
            match = findMatch(matchId);  // sync 후 formation·lineupSynced 등 fresh 상태 반영
        }
        return new MatchFotmobView(
                match.getId(),
                match.getFotmobMatchId(),
                match.getStatus(),
                match.getHomeScore(),
                match.getAwayScore(),
                match.getHomeFormation(),
                match.getAwayFormation(),
                match.isLineupSynced(),
                match.isFotmobFinalized(),
                lineupPlayerRepository.findByMatchId(matchId),
                matchEventRepository.findByMatchIdOrderByMinuteAsc(matchId)
        );
    }

    /** 스케줄을 기다리지 않고 즉시 한 경기를 동기화 (관리/테스트용). */
    public MatchFotmobView syncNow(Long matchId) {
        Match match = findMatch(matchId);

        if (match.getFotmobMatchId() == null) {
            throw new BadRequestException("FotMob matchId가 없습니다. id=" + matchId + " (일정 동기화가 먼저 필요)");
        }
        syncService.syncMatch(match);
        return getView(matchId);
    }

    /**
     * 라인업이 아직 DB에 없고 킥오프가 가까운(시간창 안) 경기면 최초 1회만 크롤+저장.
     * 저장되면 lineupSynced=true 가 되어 다음부터는 DB에서만 읽는다.
     * 킥오프가 한참 남은 경기는 라인업 자체가 없으므로 크롤하지 않는다(헛크롤 방지).
     * 쿨다운(N분) 안에 이미 크롤했으면 스킵 — 연속 요청마다 크롤 폭주 방지.
     */
    private void lazySync(Match match) {
        if (match.getFotmobMatchId() == null) return;
        if (match.isLineupSynced()) return;
        if (match.getMatchTime() == null
                || match.getMatchTime().isAfter(LocalDateTime.now().plusMinutes(LINEUP_LAZY_WINDOW_MINUTES))) {
            return;
        }
        LocalDateTime lastCrawl = lastLazyCrawled.get(match.getId());
        if (lastCrawl != null && ChronoUnit.MINUTES.between(lastCrawl, LocalDateTime.now()) < LAZY_CRAWL_COOLDOWN_MINUTES) {
            return;
        }
        // single-flight: 같은 경기가 이미 크롤 중이면 스킵(여러 명이 동시에 첫 조회해도 크롤은 1회).
        if (!inFlight.add(match.getId())) {
            return;
        }
        try {
            syncService.syncMatch(match);
            lastLazyCrawled.put(match.getId(), LocalDateTime.now());
        } catch (Exception e) {
            // 조회는 계속 — 현재 DB 상태를 반환
        } finally {
            inFlight.remove(match.getId());
        }
    }

    private Match findMatch(Long matchId) {
        return matchRepository.findById(matchId)
            .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다. id=" + matchId));
    }
}
