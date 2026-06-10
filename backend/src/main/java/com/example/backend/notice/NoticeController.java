package com.example.backend.notice;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공지사항 조회 (공개). 작성/수정/삭제는 {@link NoticeAdminController}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/notice")
public class NoticeController {

    private final NoticeService noticeService;

    /** 공지 목록 (최신순, 페이지당 8). */
    @GetMapping
    public ResponseEntity<CommonResponse<?>> list(@PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity.ok(CommonResponse.success("조회 성공", noticeService.list(pageable)));
    }

    /** 공지 단건. */
    @GetMapping("/{id}")
    public ResponseEntity<CommonResponse<?>> get(@PathVariable Long id) {
        return ResponseEntity.ok(CommonResponse.success("조회 성공", noticeService.get(id)));
    }
}
