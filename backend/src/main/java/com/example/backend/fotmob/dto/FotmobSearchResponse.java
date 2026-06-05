package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /search 응답.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobSearchResponse(
        List<Candidate> candidates
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Candidate(
            Long matchId,
            String url,
            String homeTeam,
            String awayTeam,
            String competition,
            String dateStr
    ) {}
}
