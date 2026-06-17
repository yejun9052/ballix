package com.example.backend.youtube.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Python 스크래퍼 GET /youtube/embeddable/{id} 응답.
 * 영상이 외부 사이트(iframe)에서 재생 가능한지(FIFA 공식처럼 임베드 막힌 영상 거르기용).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record YoutubeEmbeddableResponse(
        String videoId,
        boolean embeddable
) {}
