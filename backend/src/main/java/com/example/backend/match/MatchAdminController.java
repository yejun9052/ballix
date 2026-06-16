package com.example.backend.match;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    /** 다시보기 등록(교체 포함). youtube= videoId(11자) 또는 유튜브 URL 그대로. 종료 경기만. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}/replay")
    public ResponseEntity<CommonResponse<?>> setReplay(
            @PathVariable Long id,
            @RequestParam String youtube) {
        return ResponseEntity.ok(CommonResponse.success("다시보기 등록", matchService.setReplay(id, youtube)));
    }

    /** 다시보기 해제. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @DeleteMapping("/{id}/replay")
    public ResponseEntity<CommonResponse<?>> clearReplay(@PathVariable Long id) {
        return ResponseEntity.ok(CommonResponse.success("다시보기 해제", matchService.clearReplay(id)));
    }
}
