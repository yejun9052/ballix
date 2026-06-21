package com.example.backend.comment;

import com.example.backend.user.User;

import java.time.LocalDateTime;

/**
 * 댓글 응답 DTO. User 엔티티(email 등)를 노출하지 않고 화면에 필요한 것만 내린다.
 * {@code mine}은 현재 로그인 유저가 작성자인지 — 프론트가 삭제 버튼 노출 판단에 쓴다(관리자 삭제는 role로 별도 판단).
 */
public record CommentView(
        Long id,
        Long matchId,
        Long authorId,
        String authorName,
        String content,
        LocalDateTime createAt,
        boolean mine
) {
    public static CommentView from(Comment c, Long currentUserId) {
        User author = c.getUser();
        Long authorId = author == null ? null : author.getId();
        return new CommentView(
                c.getId(),
                c.getMatch() == null ? null : c.getMatch().getId(),
                authorId,
                author == null ? null : author.getName(),
                c.getContent(),
                c.getCreateAt(),
                currentUserId != null && currentUserId.equals(authorId)
        );
    }
}
