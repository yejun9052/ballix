package com.example.backend.youtube.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python 스크래퍼 GET /youtube/search?q= 응답.
 * 유튜브 검색결과(동영상)를 평탄한 후보 목록으로 담는다(경기 하이라이트 찾기용).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record YoutubeSearchResponse(
        String query,
        List<Video> videos
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Video(
            String videoId,
            String title,
            String length,    // "12:34" 형식, 없으면 null
            String channel,
            String views,
            String published
    ) {}
}
