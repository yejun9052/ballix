package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /schedule 응답 (날짜별 경기 목록).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobScheduleResponse(
        String date,
        List<ScheduledMatch> matches
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ScheduledMatch(
            Long matchId,
            Long leagueId,
            Long parentLeagueId,
            String leagueName,
            String ccode,
            Long homeId,
            String homeName,
            String homeCrest,
            Integer homeScore,
            Long awayId,
            String awayName,
            String awayCrest,
            Integer awayScore,
            String utcTime,
            boolean started,
            boolean finished,
            boolean cancelled
    ) {}
}
