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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class FotmobQueryService {

    private final MatchRepository matchRepository;
    private final LineupPlayerRepository lineupPlayerRepository;
    private final MatchEventRepository matchEventRepository;
    private final FotmobSyncService syncService;

    // 라인업이 공개되기 시작하는 킥오프 전 시간창(분). 이보다 더 미래면 lazy 크롤을 안 한다.
    private static final long LINEUP_LAZY_WINDOW_MINUTES = 60;

    @Transactional
    public List<LineupPlayer> getLineup(Long matchId) {
        matchRepository.findById(matchId).ifPresent(this::lazySync);
        return lineupPlayerRepository.findByMatchId(matchId);
    }

    @Transactional
    public List<MatchEvent> getEvents(Long matchId) {
        matchRepository.findById(matchId).ifPresent(this::lazySync);
        return matchEventRepository.findByMatchIdOrderByMinuteAsc(matchId);
    }

    @Transactional
    public MatchFotmobView getView(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다. id=" + matchId));
        lazySync(match);
        return new MatchFotmobView(
                match.getId(),
                match.getFotmobMatchId(),
                match.getStatus(),
                match.getHomeScore(),
                match.getAwayScore(),
                match.isLineupSynced(),
                match.isFotmobFinalized(),
                lineupPlayerRepository.findByMatchId(matchId),
                matchEventRepository.findByMatchIdOrderByMinuteAsc(matchId)
        );
    }

    /** 스케줄을 기다리지 않고 즉시 한 경기를 동기화 (관리/테스트용). */
    @Transactional
    public MatchFotmobView syncNow(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다. id=" + matchId));

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
     */
    private void lazySync(Match match) {
        if (match.getFotmobMatchId() == null) return;
        if (match.isLineupSynced()) return;
        if (match.getMatchTime() == null
                || match.getMatchTime().isAfter(LocalDateTime.now().plusMinutes(LINEUP_LAZY_WINDOW_MINUTES))) {
            return;
        }
        try {
            syncService.syncMatch(match);
        } catch (Exception e) {
            // 조회는 계속 — 현재 DB 상태를 반환
        }
    }
}
