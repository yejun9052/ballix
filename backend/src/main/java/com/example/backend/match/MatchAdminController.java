package com.example.backend.match;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 경기 관리자 조작 — 유튜브 다시보기 등록/해제. 전부 ROLE_ADMIN_USER 전용.
 * 등록된 replayYoutubeId는 일반 경기 조회 응답(Match 직렬화)에 그대로 포함되어
 * 프론트가 https://www.youtube.com/embed/{id} 로 임베드한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/match")
public class MatchAdminController {

    private final MatchService matchService;
    private final MatchHighlightService matchHighlightService;

    /** 하이라이트 일괄 보강(수동) — 종료됐는데 영상 없는 최근 경기를 즉시 재검색(스케줄러 30분 주기와 동일 로직).
     *  IN_PLAY 스킵 없이 바로 돈다. 이미 영상이 있으면(수동 등록 포함) 대상에서 빠진다. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/highlights/backfill")
    public ResponseEntity<CommonResponse<?>> backfillHighlights(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "7") int sinceDays) {
        int n = matchHighlightService.backfillHighlights(limit, sinceDays);
        return ResponseEntity.ok(CommonResponse.success("하이라이트 " + n + "건 보강", n));
    }

    /** 다시보기 등록(교체 포함). youtube= videoId(11자) 또는 유튜브 URL 그대로. 종료 경기만. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}/replay")
    public ResponseEntity<CommonResponse<?>> setReplay(
            @PathVariable Long id,
            @RequestParam String youtube) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.REPLAY_SET, matchService.setReplay(id, youtube)));
    }

    /** 다시보기 해제. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @DeleteMapping("/{id}/replay")
    public ResponseEntity<CommonResponse<?>> clearReplay(@PathVariable Long id) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.REPLAY_CLEARED, matchService.clearReplay(id)));
    }

    /** 특정 경기 하이라이트 강제 재동기화 — 기존(잘못된) 영상을 비우고 즉시 재검색. 새 videoId(또는 null) 반환. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/{id}/highlight/resync")
    public ResponseEntity<CommonResponse<?>> resyncHighlight(@PathVariable Long id) {
        return ResponseEntity.ok(CommonResponse.success(
                ResponseMessage.SYNC_DONE, matchHighlightService.resyncHighlight(id).getReplayYoutubeId()));
    }
}
