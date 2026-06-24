package com.example.backend.match;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 종료 경기의 유튜브 하이라이트 조회(공개). DB에 영상이 없으면 최초 조회 시 1회 유튜브 검색·저장 후 반환.
 * 관리자가 수동 등록(/api/admin/match/{id}/replay)한 영상이 있으면 그대로 우선한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/match/{matchId}/highlight")
public class MatchHighlightController {

    private final MatchHighlightService highlightService;

    @GetMapping
    public ResponseEntity<CommonResponse<?>> highlight(@PathVariable Long matchId) {
        Match m = highlightService.getOrFetch(matchId);
        return ResponseEntity.ok(CommonResponse.success(
                ResponseMessage.READ_SUCCESS, new HighlightView(m.getId(), m.getReplayYoutubeId())));
    }

    public record HighlightView(Long matchId, String youtubeId) {}
}
