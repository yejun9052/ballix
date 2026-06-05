package com.example.backend.football;

import com.example.backend.competition.Competition;
import com.example.backend.competition.CompetitionRepository;
import com.example.backend.competition.enums.CompType;
import com.example.backend.football.dto.MatchListResponse;
import com.example.backend.football.dto.MatchListResponse.CompetitionResponse;
import com.example.backend.football.dto.MatchListResponse.MatchResponse;
import com.example.backend.football.dto.MatchListResponse.TeamResponse;
import com.example.backend.matche.Match;
import com.example.backend.matche.MatchRepository;
import com.example.backend.team.Team;
import com.example.backend.team.TeamRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class FootballSyncService {

    private final FootballApiClient apiClient;
    private final CompetitionRepository competitionRepository;
    private final TeamRepository teamRepository;
    private final MatchRepository matchRepository;

    @Transactional
    public int sync(String competitionCode) {
        MatchListResponse response = apiClient.fetchMatches(competitionCode);
        List<MatchResponse> matches = response.matches();

        if (matches == null || matches.isEmpty()) {
            log.warn("[{}] 불러온 경기 데이터 없음", competitionCode);
            return 0;
        }

        Map<Long, Competition> competitionCache = new HashMap<>();
        Map<Long, Team> teamCache = new HashMap<>();

        for (MatchResponse m : matches) {
            Competition competition = competitionCache.computeIfAbsent(
                    m.competition().id(),
                    id -> saveCompetition(m.competition())
            );

            Team homeTeam = null;
            Team awayTeam = null;

            if (m.homeTeam() != null && m.homeTeam().id() != null) {
                homeTeam = teamCache.computeIfAbsent(m.homeTeam().id(), id -> saveTeam(m.homeTeam()));
            }
            if (m.awayTeam() != null && m.awayTeam().id() != null) {
                awayTeam = teamCache.computeIfAbsent(m.awayTeam().id(), id -> saveTeam(m.awayTeam()));
            }

            matchRepository.save(Match.builder()
                    .competition(competition)
                    .homeTeam(homeTeam)
                    .awayTeam(awayTeam)
                    .matchTime(parse(m.utcDate()))
                    .stage(m.stage())
                    .groupName(m.group())
                    .matchday(m.matchday())
                    .status(m.status())
                    .homeScore(m.score() != null && m.score().fullTime() != null ? m.score().fullTime().home() : null)
                    .awayScore(m.score() != null && m.score().fullTime() != null ? m.score().fullTime().away() : null)
                    .winner(m.score() != null ? m.score().winner() : null)
                    .build());
        }

        log.info("[{}] {}개 경기 저장 완료", competitionCode, matches.size());
        return matches.size();
    }

    private Competition saveCompetition(CompetitionResponse c) {
        return competitionRepository.save(Competition.builder()
                .code(c.code())
                .name(c.name())
                .type(CompType.valueOf(c.type()))
                .emblem(c.emblem() != null ? c.emblem() : "")
                .build());
    }

    private Team saveTeam(TeamResponse t) {
        return teamRepository.save(Team.builder()
                .name(t.name())
                .shortName(t.shortName() != null ? t.shortName() : t.name())
                .tla(t.tla() != null ? t.tla() : "")
                .crest(t.crest() != null ? t.crest() : "")
                .build());
    }

    private LocalDateTime parse(String isoDate) {
        return OffsetDateTime.parse(isoDate).toLocalDateTime();
    }
}
