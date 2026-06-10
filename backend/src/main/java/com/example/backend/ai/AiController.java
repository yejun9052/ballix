package com.example.backend.ai;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.match.Match;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * 경기별 AI 결과 조회. 골 요약은 종료 경기에 한해 최초 조회 시 1회 생성 후 캐시된다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/match/{matchId}/ai")
public class AiController {

    private final AiSummaryService summaryService;

    /** 종료된 경기의 골 내용 요약 — DB에 있으면 가져오고, 없으면 1회 생성·저장 후 반환.
     *  (공개 엔드포인트라 강제 재생성은 제공하지 않는다 — Gemini 쿼터 남용 방지) */
    @GetMapping("/summary")
    public ResponseEntity<CommonResponse<?>> summary(@PathVariable Long matchId) {
        Match m = summaryService.getOrGenerate(matchId);
        return ResponseEntity.ok(CommonResponse.success(
                "조회 성공", new SummaryView(m.getId(), m.getAiSummary(), m.getAiSummaryAt())));
    }

    public record SummaryView(Long matchId, String summary, LocalDateTime generatedAt) {}
}
