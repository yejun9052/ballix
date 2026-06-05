package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobScheduleResponse;
import com.example.backend.fotmob.dto.FotmobSearchResponse;
import com.example.backend.fotmob.dto.FotmobTableResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;

/**
 * Python FotMob 스크래퍼(FastAPI)를 호출하는 클라이언트.
 * 헤드리스 브라우저 수집이 수십 초 걸릴 수 있어 read timeout을 넉넉히 둔다.
 */
@Slf4j
@Component
public class FotmobClient {

    private final RestClient restClient;

    public FotmobClient(@Value("${fotmob.api.base-url:http://127.0.0.1:8800}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(90));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    /** 단일 경기의 라인업·이벤트·평점을 가져온다. */
    public FotmobMatchResponse getMatch(Long fotmobMatchId) {
        return restClient.get()
                .uri("/match/{id}", fotmobMatchId)
                .retrieve()
                .body(FotmobMatchResponse.class);
    }

    /** 날짜별 경기 목록 (date=YYYYMMDD, leagues=쉼표구분 leagueName 부분매칭). */
    public FotmobScheduleResponse getSchedule(String date, String leagues) {
        String uri = UriComponentsBuilder.fromPath("/schedule")
                .queryParam("date", date)
                .queryParam("tz", "Asia/Seoul")
                .queryParam("leagues", leagues == null ? "" : leagues)
                .build()
                .toUriString();
        return restClient.get().uri(uri).retrieve().body(FotmobScheduleResponse.class);
    }

    /** 리그 순위표 (조별 지원). */
    public FotmobTableResponse getLeagueTable(Long leagueId) {
        return restClient.get()
                .uri("/league/{id}/table", leagueId)
                .retrieve()
                .body(FotmobTableResponse.class);
    }

    /** 팀명/대회로 경기를 검색해 matchId 후보를 얻는다. */
    public FotmobSearchResponse search(String team1, String team2, String competition) {
        String uri = UriComponentsBuilder.fromPath("/search")
                .queryParam("team1", team1)
                .queryParam("team2", team2 == null ? "" : team2)
                .queryParam("competition", competition == null ? "" : competition)
                .build()
                .toUriString();
        return restClient.get()
                .uri(uri)
                .retrieve()
                .body(FotmobSearchResponse.class);
    }
}
