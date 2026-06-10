package com.example.backend.fotmob;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 경기별 FotMob 데이터(라인업·이벤트·평점) 조회 및 수동 동기화 API.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/match/{matchId}/fotmob")
public class FotmobController {

    private final FotmobQueryService queryService;

    /** 통합 뷰 (기본정보 + 라인업 + 이벤트). */
    @GetMapping
    public ResponseEntity<CommonResponse<?>> view(@PathVariable Long matchId) {
        return ResponseEntity.ok(
                CommonResponse.success("조회 성공", queryService.getView(matchId)));
    }

    /** 라인업(선발/후보 + 평점 + 교체분, 페이지당 8). 포메이션 피치는 통합 뷰(GET .)를 쓰세요. */
    @GetMapping("/lineup")
    public ResponseEntity<CommonResponse<?>> lineup(
            @PathVariable Long matchId,
            @PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity.ok(
                CommonResponse.success("조회 성공", queryService.getLineup(matchId, pageable)));
    }

    /** 이벤트(골/카드/교체 타임라인, 페이지당 8). */
    @GetMapping("/events")
    public ResponseEntity<CommonResponse<?>> events(
            @PathVariable Long matchId,
            @PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity.ok(
                CommonResponse.success("조회 성공", queryService.getEvents(matchId, pageable)));
    }

    /** 스케줄을 기다리지 않고 즉시 매핑+동기화 (관리/테스트용, 크롤 유발 → 관리자). */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/sync")
    public ResponseEntity<CommonResponse<?>> syncNow(@PathVariable Long matchId) {
        return ResponseEntity.ok(
                CommonResponse.success("동기화 완료", queryService.syncNow(matchId)));
    }
}
