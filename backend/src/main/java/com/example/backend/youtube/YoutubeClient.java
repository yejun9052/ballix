package com.example.backend.youtube;

import com.example.backend.youtube.dto.YoutubeEmbeddableResponse;
import com.example.backend.youtube.dto.YoutubeSearchResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;

/**
 * Python 스크래퍼(FastAPI)의 유튜브 검색 엔드포인트를 호출하는 클라이언트.
 * FotMob과 같은 방식 — 공개 API 없이 Playwright로 SSR(ytInitialData)을 읽는다.
 */
@Slf4j
@Component
public class YoutubeClient {

    private final RestClient restClient;

    public YoutubeClient(@Value("${fotmob.api.base-url:http://127.0.0.1:8800}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(40));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
    }

    /** 유튜브에서 q로 동영상을 검색해 후보 목록을 얻는다(경기 하이라이트 찾기용). */
    public YoutubeSearchResponse search(String q) {
        String uri = UriComponentsBuilder.fromPath("/youtube/search")
                .queryParam("q", q)
                .queryParam("limit", 12)   // 한국 방송사 후보까지 넓게 받기
                .build()
                .toUriString();
        return restClient.get()
                .uri(uri)
                .retrieve()
                .body(YoutubeSearchResponse.class);
    }

    /** 영상이 외부 사이트(iframe)에서 재생 가능한지 — FIFA 공식처럼 임베드 막힌 영상 거르기용. */
    public boolean isEmbeddable(String videoId) {
        try {
            YoutubeEmbeddableResponse r = restClient.get()
                    .uri("/youtube/embeddable/{id}", videoId)
                    .retrieve()
                    .body(YoutubeEmbeddableResponse.class);
            return r != null && r.embeddable();
        } catch (Exception e) {
            log.warn("[youtube] 임베드 확인 실패 videoId={} : {}", videoId, e.getMessage());
            return false;
        }
    }
}
