package com.example.backend.comment;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    // 특정 경기의 댓글 (최신순, 페이지네이션)
    Page<Comment> findByMatchIdOrderByCreateAtDesc(Long matchId, Pageable pageable);
}
