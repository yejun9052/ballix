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
        String venue,           // 구장 이름 (FotMob infoBox.Stadium.name, 없으면 null)
        String statusType,      // SCHEDULED / IN_PLAY / FINISHED / CANCELLED
        String statusReason,
        String liveTime,        // 진행 중 경과 시간 예: "51'" (라이브일 때만)
        Integer liveSeconds,    // 경과 초(mm:ss 환산) — 초 단위 라이브 시계 앵커용
        Integer liveBasePeriod, // 현재 하프 정규시간 끝(45/90) — 추가시간 표기 base
        Integer liveAddedTime,  // 현재 하프 부여 추가시간(분) — "+N" 상한
        Integer firstHalfAddedTime,   // 전반 추가시간(분), 없으면 null
        Integer secondHalfAddedTime,  // 후반 추가시간(분), 없으면 null
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
            Integer subOutMinute,
            List<MatchStat> matchStats   // 경기별 상세 스탯(슈팅·기회 창출·터치 등)
    ) {}

    /** 경기별 선수 스탯 1개(예: title="Chances created", value=3). value는 숫자/문자 혼재라 Object. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MatchStat(String title, Object value) {}

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
