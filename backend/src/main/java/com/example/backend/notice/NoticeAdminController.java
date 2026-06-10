package com.example.backend.notice;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.notice.dto.NoticeRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공지사항 작성/수정/삭제 — 관리자(ROLE_ADMIN_USER) 전용.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/notice")
public class NoticeAdminController {

    private final NoticeService noticeService;

    /** 공지 등록(공지 때리기). 본문 {title, content}. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping
    public ResponseEntity<CommonResponse<?>> create(
            @AuthenticationPrincipal Long userId,
            @RequestBody NoticeRequest req) {
        return ResponseEntity.ok(CommonResponse.success("공지 등록", noticeService.create(userId, req)));
    }

    /** 공지 수정. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}")
    public ResponseEntity<CommonResponse<?>> update(
            @PathVariable Long id,
            @RequestBody NoticeRequest req) {
        return ResponseEntity.ok(CommonResponse.success("공지 수정", noticeService.update(id, req)));
    }

    /** 공지 삭제. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @DeleteMapping("/{id}")
    public ResponseEntity<CommonResponse<?>> delete(@PathVariable Long id) {
        noticeService.delete(id);
        return ResponseEntity.ok(CommonResponse.success("공지 삭제", id));
    }
}
