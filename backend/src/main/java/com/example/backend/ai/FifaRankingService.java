package com.example.backend.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * FIFA 남자 국가대표 랭킹(근사 스냅샷)을 resources/fifa-rankings.json 에서 로드한다.
 * 팀명(FotMob 표기) → 순위. 부팅 시 1회 로드하며, 파일만 수정해 갱신할 수 있다.
 * 순위는 숫자가 작을수록 강팀.
 */
@Slf4j
@Component
public class FifaRankingService {

    private final Map<String, Integer> ranks = new HashMap<>();

    public FifaRankingService() {
        try {
            ObjectMapper om = new ObjectMapper();
            Map<String, Integer> raw = om.readValue(
                    new ClassPathResource("fifa-rankings.json").getInputStream(),
                    new TypeReference<Map<String, Integer>>() {});
            raw.forEach((name, rank) -> ranks.put(norm(name), rank));
            log.info("[fifa] FIFA 랭킹 {}개 로드", ranks.size());
        } catch (Exception e) {
            log.warn("[fifa] FIFA 랭킹 로드 실패(예측에서 FIFA랭킹은 생략됨): {}", e.getMessage());
        }
    }

    /** 팀명으로 FIFA 순위 조회(없으면 null). */
    public Integer rankOf(String teamName) {
        if (teamName == null) return null;
        return ranks.get(norm(teamName));
    }

    private String norm(String s) {
        return s.trim().toLowerCase();
    }
}
