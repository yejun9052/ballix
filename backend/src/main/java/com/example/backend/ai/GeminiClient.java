package com.example.backend.ai;

import com.example.backend.global.exceptopn.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Google Gemini(무료 플랜, 기본 gemini-3.1-flash-lite) 호출 클라이언트.
 * 별도 SDK 없이 generateContent REST를 RestClient로 직접 호출한다(FotmobClient와 동일 패턴).
 * 토큰 절약을 위해 thinkingBudget=0(추론 비활성)을 기본으로 권장한다 — 호출부 generationConfig에서 지정.
 */
@Slf4j
@Component
public class GeminiClient {

    private final RestClient restClient;
    private final String model;
    private final String apiKey;

    public GeminiClient(
            @Value("${ai.gemini.base-url:https://generativelanguage.googleapis.com/v1beta}") String baseUrl,
            @Value("${ai.gemini.model:gemini-3.1-flash-lite}") String model,
            @Value("${ai.gemini.api-key:}") String apiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
        this.model = model;
        this.apiKey = apiKey;
    }

    /**
     * 프롬프트로 텍스트 1건 생성.
     * generationConfig 예: temperature / responseMimeType / responseSchema / thinkingConfig.
     */
    public String generate(String prompt, Map<String, Object> generationConfig) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new BadRequestException(
                    "Gemini API 키가 없습니다. application.yml의 ai.gemini.api-key 또는 환경변수 GEMINI_API_KEY를 설정하세요.");
        }
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                "generationConfig", generationConfig);

        // 무료 모델은 순간 과부하로 429/503을 종종 뱉는다 → 짧은 백오프로 재시도.
        int maxAttempts = 4;
        RestClientResponseException last = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Spring Boot 4는 Jackson 3 변환기를 쓰므로 응답은 Map으로 받아 직접 탐색(버전 충돌 회피).
                @SuppressWarnings("unchecked")
                Map<String, Object> resp = restClient.post()
                        .uri("/models/{model}:generateContent", model)
                        .header("x-goog-api-key", apiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(Map.class);
                return extractText(resp);
            } catch (RestClientResponseException e) {
                int sc = e.getStatusCode().value();
                boolean retryable = sc == 429 || sc >= 500;
                if (!retryable) {
                    throw new BadRequestException("Gemini 호출 실패(" + sc + "). 키/요청을 확인하세요.");
                }
                last = e;
                log.warn("[gemini] 과부하 재시도 {}/{} (status={})", attempt, maxAttempts, sc);
                if (attempt < maxAttempts) {
                    sleep(700L * attempt); // 0.7s, 1.4s, 2.1s
                }
            }
        }
        throw new BadRequestException(
                "Gemini가 일시적으로 과부하 상태입니다(여러 번 재시도 실패). 잠시 후 다시 시도하세요." +
                        (last != null ? " [" + last.getStatusCode().value() + "]" : ""));
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    /** candidates[0].content.parts[*].text 를 이어붙여 반환. */
    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> resp) {
        if (resp == null) {
            throw new BadRequestException("Gemini 응답이 비어있습니다.");
        }
        StringBuilder sb = new StringBuilder();
        Object candidates = resp.get("candidates");
        if (candidates instanceof List<?> list && !list.isEmpty()
                && list.get(0) instanceof Map<?, ?> cand0
                && cand0.get("content") instanceof Map<?, ?> content
                && content.get("parts") instanceof List<?> parts) {
            for (Object part : parts) {
                if (part instanceof Map<?, ?> p && p.get("text") instanceof String t) {
                    sb.append(t);
                }
            }
        }
        String text = sb.toString().trim();
        if (text.isEmpty()) {
            log.warn("[gemini] 빈 텍스트 응답: {}", resp);
            throw new BadRequestException("Gemini 응답에서 텍스트를 추출하지 못했습니다(쿼터/차단 가능).");
        }
        return text;
    }
}
