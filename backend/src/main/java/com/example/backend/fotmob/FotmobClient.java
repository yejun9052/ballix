package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobCommentaryResponse;
import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobPlayerResponse;
import com.example.backend.fotmob.dto.FotmobPlayoffResponse;
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
 * 헤드리스 브라우저 수집은 보통 수 초(SSR 우선 추출)이며, read timeout은 멈춘 크롤 차단용 상한이다.
 */
@Slf4j
@Component
public class FotmobClient {

    private final RestClient restClient;

    public FotmobClient(@Value("${fotmob.api.base-url:http://127.0.0.1:8800}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        // 정상 크롤은 ~3초(SSR 우선 추출). 최악 경로(goto 30s + 폴백 스크롤 ~15s)도 ~45초라
        // 60초면 충분한 안전 상한 — 진짜 멈춘 크롤만 끊는다.
        factory.setReadTimeout(Duration.ofSeconds(60));
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

    /** 선수 상세 정보(프로필 + 시즌 스탯). DB 미저장 프록시. */
    public FotmobPlayerResponse getPlayer(Long playerId) {
        return restClient.get()
                .uri("/player/{id}", playerId)
                .retrieve()
                .body(FotmobPlayerResponse.class);
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

    /** 리그/토너먼트 시즌 전체 경기 일정(결승까지) — 월드컵 등 전체 동기화용. */
    public FotmobScheduleResponse getLeagueFixtures(Long leagueId) {
        return restClient.get()
                .uri("/league/{id}/fixtures", leagueId)
                .retrieve()
                .body(FotmobScheduleResponse.class);
    }

    /** 토너먼트 예상 브래킷(라운드별 대진) — 32강 예상 대진 동기화용. */
    public FotmobPlayoffResponse getPlayoff(Long leagueId) {
        return restClient.get()
                .uri("/league/{id}/playoff", leagueId)
                .retrieve()
                .body(FotmobPlayoffResponse.class);
    }

    /** 경기 골 해설(라이브티커) — 끝난 경기 요약용. */
    public FotmobCommentaryResponse getCommentary(Long fotmobMatchId) {
        return restClient.get()
                .uri("/commentary/{id}", fotmobMatchId)
                .retrieve()
                .body(FotmobCommentaryResponse.class);
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
