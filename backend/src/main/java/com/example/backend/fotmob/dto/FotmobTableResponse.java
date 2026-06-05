package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /league/{id}/table 응답 (조별 순위).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobTableResponse(
        Long leagueId,
        List<Group> groups
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Group(
            String groupName,
            List<Row> rows
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Row(
            Integer rank,
            Long teamId,
            String name,
            String shortName,
            String crest,
            Integer played,
            Integer wins,
            Integer draws,
            Integer losses,
            String scoresStr,
            Integer goalDiff,
            Integer points,
            String qualColor
    ) {}
}
