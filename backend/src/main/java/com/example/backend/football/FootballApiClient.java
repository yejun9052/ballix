package com.example.backend.football;

import com.example.backend.football.dto.MatchListResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FootballApiClient {

    private final RestClient restClient;

    public FootballApiClient(
            @Value("${football.api.base-url}") String baseUrl,
            @Value("${football.api.key}") String apiKey) {
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("X-Auth-Token", apiKey)
                .build();
    }

    public MatchListResponse fetchMatches(String competitionCode) {
        return restClient.get()
                .uri("/competitions/{code}/matches", competitionCode)
                .retrieve()
                .body(MatchListResponse.class);
    }
}
