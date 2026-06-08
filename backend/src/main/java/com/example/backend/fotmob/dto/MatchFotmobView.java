package com.example.backend.fotmob.dto;

import com.example.backend.fotmob.lineup.LineupPlayer;
import com.example.backend.fotmob.matchevent.MatchEvent;

import java.util.List;

/**
 * 프론트가 한 번에 받는 경기 FotMob 뷰 (기본정보 + 라인업 + 이벤트).
 */
public record MatchFotmobView(
        Long matchId,
        Long fotmobMatchId,
        String status,
        Integer homeScore,
        Integer awayScore,
        boolean lineupSynced,
        boolean finalized,
        List<LineupPlayer> lineup,
        List<MatchEvent> events
) {}
