package com.example.backend.football.dto;

import java.util.List;

public record MatchListResponse(List<MatchResponse> matches) {

    public record MatchResponse(
            Long id,
            String utcDate,
            String status,
            Integer matchday,
            String stage,
            String group,
            CompetitionResponse competition,
            TeamResponse homeTeam,
            TeamResponse awayTeam,
            ScoreResponse score
    ) {}

    public record CompetitionResponse(
            Long id,
            String code,
            String name,
            String type,
            String emblem
    ) {}

    public record TeamResponse(
            Long id,
            String name,
            String shortName,
            String tla,
            String crest
    ) {}

    public record ScoreResponse(
            String winner,
            FullTime fullTime
    ) {
        public record FullTime(Integer home, Integer away) {}
    }
}
