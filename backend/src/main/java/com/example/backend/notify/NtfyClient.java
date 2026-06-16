package com.example.backend.notify;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * ntfy 푸시 알림 전송 클라이언트(셀프호스트/ntfy.sh 공용).
 * 단일 토픽으로 보내고, 사용자는 그 토픽을 ntfy 앱/웹에서 구독한다.
 *
 * - 전송 실패는 본 로직을 방해하지 않도록 내부에서 삼킨다(로그만).
 * - 한글은 HTTP 헤더에서 깨질 수 있어 **본문(body, UTF-8)** 에 싣고, Title은 ASCII 라벨,
 *   Tags는 ntfy 이모지 단축명(ASCII, 예: "soccer","checkered_flag")만 쓴다.
 */
@Slf4j
@Component
public class NtfyClient {

    private final RestClient restClient;
    private final String topic;
    private final boolean enabled;

    public NtfyClient(
            @Value("${ntfy.base-url:https://ntfy.sh}") String baseUrl,
            @Value("${ntfy.topic:}") String topic,
            @Value("${ntfy.enabled:false}") boolean enabled) {
        this.topic = topic == null ? "" : topic.trim();
        this.enabled = enabled && !this.topic.isBlank();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .build();
        if (this.enabled) {
            log.info("[ntfy] 알림 활성화 — topic={}", this.topic);
        }
    }

    /**
     * 알림 전송. title은 ASCII 라벨(헤더), message는 UTF-8 본문(한글 OK),
     * tags는 ntfy 이모지 단축명(쉼표구분, ASCII). 비활성/실패 시 조용히 무시.
     */
    public void send(String title, String message, String tags) {
        if (!enabled) {
            return;
        }
        try {
            restClient.post()
                    .uri("/{topic}", topic)
                    .header("Title", title == null ? "Ballix" : title)
                    .header("Tags", tags == null ? "" : tags)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body((message == null ? "" : message).getBytes(StandardCharsets.UTF_8))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("[ntfy] 전송 실패: {}", e.getMessage());
        }
    }
}
