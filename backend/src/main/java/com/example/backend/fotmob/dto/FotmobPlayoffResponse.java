package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /league/{id}/playoff 응답 (토너먼트 예상 브래킷).
 * 라운드별 대진을 매치 단위로 평탄화한 목록. 32강(stage "1/16")은 실제 예상 팀,
 * 그 이후는 미정(tbd)이다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobPlayoffResponse(
        Long leagueId,
        List<PlayoffMatch> matchups
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayoffMatch(
            Long matchId,
            String stage,
            Integer drawOrder,
            boolean tbd1,
            boolean tbd2,
            Long homeId,
            String homeName,
            String homeShortName,
            String homeCrest,
            Integer homeScore,
            Long awayId,
            String awayName,
            String awayShortName,
            String awayCrest,
            Integer awayScore,
            String utcTime,
            boolean started,
            boolean finished,
            boolean cancelled
    ) {}
}
