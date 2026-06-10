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
        String liveTime,        // 진행 중 경과 시간 예: "51'" (라이브일 때만)
        Integer liveSeconds,    // 경과 초(mm:ss 환산) — 초 단위 라이브 시계 앵커용
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
            Double posX,
            Double posY,
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
