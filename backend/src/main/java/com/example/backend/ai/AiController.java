package com.example.backend.ai;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.match.Match;
import com.example.backend.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
    private final AiPredictionSnapshotRepository snapshotRepository;

    /** AI 승률 예측 히스토리(공개) — 관리자가 경기 전 예측을 켠 경기에 한해, 단계별(경기 전→90분)
     *  승률·당시 스코어·변동 사유를 시간순으로 반환. 예측 안 켠 경기는 빈 배열. */
    @GetMapping("/history")
    public ResponseEntity<CommonResponse<?>> history(@PathVariable Long matchId) {
        var rows = snapshotRepository.findByMatchIdOrderByPhaseMinuteAsc(matchId)
                .stream().map(SnapshotView::from).toList();
        return ResponseEntity.ok(CommonResponse.success("조회 성공", rows));
    }

    /** 히스토리 1행 — phaseMinute: 0=경기 전, 15·30·45·60·75·90=라이브. */
    public record SnapshotView(Integer phaseMinute, Integer homePct, Integer drawPct, Integer awayPct,
                               Integer homeScore, Integer awayScore, String reason, LocalDateTime at) {
        static SnapshotView from(AiPredictionSnapshot s) {
            return new SnapshotView(s.getPhaseMinute(), s.getHomePct(), s.getDrawPct(), s.getAwayPct(),
                    s.getHomeScore(), s.getAwayScore(), s.getReason(), s.getCreateAt());
        }
    }

    /** 종료된 경기의 골 내용 요약 — DB에 있으면 가져오고, 없으면 1회 생성·저장 후 반환.
     *  로그인한 유저만 조회 가능(강제 재생성은 제공하지 않는다 — Gemini 쿼터 남용 방지). */
    @GetMapping("/summary")
    public ResponseEntity<CommonResponse<?>> summary(@PathVariable Long matchId,
                                                     @AuthenticationPrincipal Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
        Match m = summaryService.getOrGenerate(matchId);
        return ResponseEntity.ok(CommonResponse.success(
                "조회 성공", new SummaryView(m.getId(), m.getAiSummary(), m.getAiSummaryAt())));
    }

    public record SummaryView(Long matchId, String summary, LocalDateTime generatedAt) {}
}
