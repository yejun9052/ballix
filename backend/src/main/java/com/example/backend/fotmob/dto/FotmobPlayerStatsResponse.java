package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /league/{id}/player-stats 응답 (득점왕/도움왕 랭킹).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobPlayerStatsResponse(
        Long leagueId,
        List<Item> scorers,
        List<Item> assists
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Item(
            Integer rank,
            Long playerId,
            String name,
            Long teamId,
            String teamName,
            String countryCode,
            Integer value,
            Integer matchesPlayed
    ) {}
}
