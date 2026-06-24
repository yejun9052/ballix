package com.example.backend.notice;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import com.example.backend.notice.dto.NoticeRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공지사항 작성/수정/삭제 + 전체 목록 — 관리자(ROLE_ADMIN_USER) 전용.
 * 게시 예약은 본문의 publishAt(게시 시각)/expireAt(내림 시각)으로 설정한다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/notice")
public class NoticeAdminController {

    private final NoticeService noticeService;

    /** 전체 공지 목록 — 게시 전(SCHEDULED)/내려간(EXPIRED) 공지 포함(상태 필드로 구분). */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @GetMapping
    public ResponseEntity<CommonResponse<?>> list(@PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.READ_SUCCESS, noticeService.adminList(pageable)));
    }

    /** 공지 등록(공지 때리기). 본문 {title, content, publishAt?, expireAt?} — 시각은 ISO-8601, null=즉시/무기한. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping
    public ResponseEntity<CommonResponse<?>> create(
            @AuthenticationPrincipal Long userId,
            @RequestBody NoticeRequest req) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.NOTICE_CREATED, noticeService.create(userId, req)));
    }

    /** 공지 수정. publishAt/expireAt 는 보낸 값으로 교체(null=즉시/무기한) — expireAt을 현재로 보내면 즉시 내림. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PutMapping("/{id}")
    public ResponseEntity<CommonResponse<?>> update(
            @PathVariable Long id,
            @RequestBody NoticeRequest req) {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.NOTICE_UPDATED, noticeService.update(id, req)));
    }

    /** 공지 삭제. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @DeleteMapping("/{id}")
    public ResponseEntity<CommonResponse<?>> delete(@PathVariable Long id) {
        noticeService.delete(id);
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.NOTICE_DELETED, id));
    }
}
