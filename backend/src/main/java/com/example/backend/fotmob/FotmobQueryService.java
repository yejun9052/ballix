package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.MatchFotmobView;
import com.example.backend.fotmob.lineup.LineupPlayer;
import com.example.backend.fotmob.lineup.LineupPlayerRepository;
import com.example.backend.fotmob.matchevent.MatchEvent;
import com.example.backend.fotmob.matchevent.MatchEventRepository;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FotmobQueryService {

    private final MatchRepository matchRepository;
    private final LineupPlayerRepository lineupPlayerRepository;
    private final MatchEventRepository matchEventRepository;
    private final FotmobSyncService syncService;

    @Transactional(readOnly = true)
    public List<LineupPlayer> getLineup(Long matchId) {
        return lineupPlayerRepository.findByMatchId(matchId);
    }

    @Transactional(readOnly = true)
    public List<MatchEvent> getEvents(Long matchId) {
        return matchEventRepository.findByMatchIdOrderByMinuteAsc(matchId);
    }

    @Transactional(readOnly = true)
    public MatchFotmobView getView(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new RuntimeException("경기를 찾을 수 없습니다. id=" + matchId));
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
                .orElseThrow(() -> new RuntimeException("경기를 찾을 수 없습니다. id=" + matchId));

        if (match.getFotmobMatchId() == null) {
            throw new RuntimeException("FotMob matchId가 없습니다. id=" + matchId + " (일정 동기화가 먼저 필요)");
        }
        syncService.syncMatch(match);
        return getView(matchId);
    }
}
