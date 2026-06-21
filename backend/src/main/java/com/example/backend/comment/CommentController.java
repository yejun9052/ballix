package com.example.backend.comment;

import com.example.backend.comment.dto.CreateCommentRequest;
import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * 경기별 댓글 API.
 *  - 조회: 공개
 *  - 작성/삭제: 로그인 필요(@AuthenticationPrincipal userId 가 null 이면 서비스가 401)
 *  - 삭제: 본인 또는 관리자
 */
@RestController
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    // 경기 댓글 목록 (공개, 최신순, 페이지당 10)
    @GetMapping("/api/match/{matchId}/comments")
    public ResponseEntity<CommonResponse<?>> list(
            @PathVariable Long matchId,
            @AuthenticationPrincipal Long userId,
            @PageableDefault(size = 10) Pageable pageable) {
        return ResponseEntity.ok(
                CommonResponse.success("조회 성공", commentService.list(matchId, userId, pageable)));
    }

    // 댓글 작성 (로그인 필요)
    @PostMapping("/api/match/{matchId}/comments")
    public ResponseEntity<CommonResponse<?>> create(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long matchId,
            @RequestBody CreateCommentRequest request) {
        return ResponseEntity.ok(
                CommonResponse.success("댓글 작성 성공", commentService.create(userId, matchId, request.content())));
    }

    // 댓글 삭제 (본인 또는 관리자)
    @DeleteMapping("/api/comments/{commentId}")
    public ResponseEntity<CommonResponse<?>> delete(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long commentId) {
        commentService.delete(userId, commentId);
        return ResponseEntity.ok(CommonResponse.success("댓글 삭제 성공", null));
    }
}
