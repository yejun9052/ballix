package com.example.backend.fotmob.playerstat;

import java.util.List;

/**
 * 개인 기록(득점왕/도움왕) 응답 DTO. 프론트는 playerId/teamId로 사진·국기 URL을 직접 구성한다.
 */
public record PlayerStatView(
        Integer rank,
        Long fotmobPlayerId,
        String playerName,
        Long fotmobTeamId,
        String teamName,
        String countryCode,
        Integer value,
        Integer matchesPlayed
) {
    public static PlayerStatView from(PlayerStat s) {
        return new PlayerStatView(
                s.getRankNo(), s.getFotmobPlayerId(), s.getPlayerName(),
                s.getFotmobTeamId(), s.getTeamName(), s.getCountryCode(),
                s.getStatValue(), s.getMatchesPlayed());
    }

    /** 화면 응답 묶음 — 득점왕/도움왕 두 리스트. */
    public record Board(List<PlayerStatView> scorers, List<PlayerStatView> assists) {}
}
