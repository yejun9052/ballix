package com.example.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 나라/팀명 한국어 번역 — FotMob 영문 표기를 Gemini(기본 gemini-3.1-flash-lite)로 한국어로 옮긴다.
 * 여러 이름을 한 번에 보내 토큰을 아끼고(배치), 결과는 **정규화 키(normalizeKey)**: 번역 맵으로 돌려준다 —
 * 모델이 원문(original)을 발음기호/대소문자/공백까지 똑같이 echo하지 못해도 매칭되게 하기 위함(P3).
 * 번역 실패는 본 크롤을 막지 않도록 빈 맵을 반환한다(호출부에서 원문만 유지).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TranslationService {

    private final GeminiClient geminiClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ai.translation.enabled:true}")
    private boolean enabled;

    /** 영문 나라/팀명 리스트를 한국어로 일괄 번역. 실패/비활성 시 빈 맵(원문 유지). */
    public Map<String, String> translateTeamNames(List<String> names) {
        if (!enabled || names == null || names.isEmpty()) {
            return Map.of();
        }
        try {
            String json = geminiClient.generate(buildPrompt(names), config());
            Map<String, String> result = parse(json);
            log.info("[translate] 팀명 {}건 요청 → {}건 번역", names.size(), result.size());
            return result;
        } catch (Exception e) {
            log.warn("[translate] 팀명 번역 실패({}건): {}", names.size(), e.getMessage());
            return Map.of();
        }
    }

    private String buildPrompt(List<String> names) {
        String list = String.join("\n", names);
        return """
                다음은 축구 국가대표팀 또는 클럽의 영문 이름 목록입니다. 각 이름을 한국어로 번역하세요.
                규칙:
                - 한국에서 통용되는 공식 표기를 사용하세요(예: South Korea→대한민국, Brazil→브라질, Cote d'Ivoire→코트디부아르).
                - 줄임말이 아닌 정식 명칭으로 표기하세요.
                - 각 항목에 original(입력 원문 그대로)과 korean(한국어 번역)을 채우세요. original은 입력과 한 글자도 다르지 않게 그대로 두세요.
                - JSON 배열 외의 다른 텍스트는 출력하지 마세요.

                [번역할 이름]
                %s""".formatted(list);
    }

    private Map<String, Object> config() {
        Map<String, Object> item = Map.of(
                "type", "OBJECT",
                "properties", Map.of(
                        "original", Map.of("type", "STRING"),
                        "korean", Map.of("type", "STRING")),
                "required", List.of("original", "korean"));
        Map<String, Object> schema = Map.of("type", "ARRAY", "items", item);
        return Map.of(
                "temperature", 0,
                "responseMimeType", "application/json",
                "responseSchema", schema,
                "thinkingConfig", Map.of("thinkingBudget", 0));
    }

    private Map<String, String> parse(String json) throws Exception {
        JsonNode arr = objectMapper.readTree(json);
        Map<String, String> out = new HashMap<>();
        if (arr.isArray()) {
            for (JsonNode n : arr) {
                String original = n.path("original").asText("");
                String korean = n.path("korean").asText("");
                if (!original.isBlank() && !korean.isBlank()) {
                    out.put(normalizeKey(original), korean.trim());   // 정규화 키로 저장(P3)
                }
            }
        }
        return out;
    }

    /**
     * 매칭용 정규화 키 — 발음기호 제거(NFD+combining mark 제거) + 소문자 + 공백 정리.
     * 예: "Côte d'Ivoire" / "Cote d'Ivoire" / " cote d'ivoire " → 동일 키.
     * 호출부(enrichTeamTranslations)도 팀명을 이 메서드로 정규화해 lookup 한다.
     */
    public static String normalizeKey(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return n.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
