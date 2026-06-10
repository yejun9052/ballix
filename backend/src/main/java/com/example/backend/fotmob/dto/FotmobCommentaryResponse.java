package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /commentary/{matchId} 응답.
 * 골 장면 라이브티커(영문 해설 텍스트)만 시간순으로 담는다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobCommentaryResponse(
        Long matchId,
        List<GoalComment> goals
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GoalComment(
            String minute,
            String addedTime,
            Boolean isHome,
            String text
    ) {}
}
