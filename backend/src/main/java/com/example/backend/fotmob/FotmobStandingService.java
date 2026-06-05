package com.example.backend.fotmob;

import com.example.backend.competition.Competition;
import com.example.backend.competition.CompetitionRepository;
import com.example.backend.fotmob.dto.FotmobTableResponse;
import com.example.backend.fotmob.dto.FotmobTableResponse.Group;
import com.example.backend.fotmob.dto.FotmobTableResponse.Row;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 리그 순위표를 FotMob에서 가져와 LeagueStanding으로 저장한다.
 * 경기 종료 시 해당 대회 순위를 일괄 삭제 후 재삽입한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FotmobStandingService {

    private final FotmobClient fotmobClient;
    private final CompetitionRepository competitionRepository;
    private final LeagueStandingRepository standingRepository;

    /** 내부 Competition PK 기준으로 순위 갱신. */
    @Transactional
    public void syncStandings(Long competitionId) {
        Competition comp = competitionRepository.findById(competitionId).orElse(null);
        if (comp == null || comp.getFotmobLeagueId() == null) {
            return;
        }

        FotmobTableResponse resp = fotmobClient.getLeagueTable(comp.getFotmobLeagueId());
        if (resp == null || resp.groups() == null || resp.groups().isEmpty()) {
            return;
        }

        List<LeagueStanding> rows = new ArrayList<>();
        for (Group g : resp.groups()) {
            if (g.rows() == null) continue;
            for (Row r : g.rows()) {
                rows.add(LeagueStanding.builder()
                        .competitionId(competitionId)
                        .groupName(g.groupName())
                        .rankNo(r.rank())
                        .fotmobTeamId(r.teamId())
                        .teamName(r.name() == null ? "" : r.name())
                        .crest(r.crest())
                        .played(r.played())
                        .wins(r.wins())
                        .draws(r.draws())
                        .losses(r.losses())
                        .goalDiff(r.goalDiff())
                        .points(r.points())
                        .build());
            }
        }

        standingRepository.deleteByCompetitionId(competitionId);
        standingRepository.saveAll(rows);
        log.info("[fotmob-standing] competitionId={} 순위 {}행 갱신", competitionId, rows.size());
    }

    @Transactional(readOnly = true)
    public List<LeagueStanding> getStandings(Long competitionId) {
        return standingRepository.findByCompetitionIdOrderByGroupNameAscRankNoAsc(competitionId);
    }
}
