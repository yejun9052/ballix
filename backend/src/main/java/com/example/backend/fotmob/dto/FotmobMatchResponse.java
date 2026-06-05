package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /match/{id} 응답.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobMatchResponse(
        Long matchId,
        String leagueName,
        String statusType,      // SCHEDULED / IN_PLAY / FINISHED / CANCELLED
        String statusReason,
        boolean started,
        boolean finished,
        Long homeTeamId,
        String homeTeamName,
        Integer homeScore,
        String homeFormation,
        Long awayTeamId,
        String awayTeamName,
        Integer awayScore,
        String awayFormation,
        boolean lineupAvailable,
        List<LineupDto> lineups,
        List<EventDto> events
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LineupDto(
            Long playerId,
            String name,
            Integer shirtNumber,
            Integer positionId,
            boolean isHome,
            boolean isStarter,
            Double rating,
            Integer subInMinute,
            Integer subOutMinute
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EventDto(
            String type,         // GOAL / CARD / SUB
            Integer minute,
            Integer addedTime,
            boolean isHome,
            Long playerId,
            String playerName,
            String detail
    ) {}
}
