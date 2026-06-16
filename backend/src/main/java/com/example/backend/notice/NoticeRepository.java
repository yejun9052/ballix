package com.example.backend.notice;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface NoticeRepository extends JpaRepository<Notice, Long> {

    // 전체 공지 최신순 — 관리자 목록용(게시 전/내려간 것 포함)
    Page<Notice> findAllByOrderByCreateAtDesc(Pageable pageable);

    // 공개 목록: 게시창(publishAt~expireAt) 안의 공지만, 최신순
    @Query("SELECT n FROM Notice n " +
            "WHERE (n.publishAt IS NULL OR n.publishAt <= :now) " +
            "AND (n.expireAt IS NULL OR n.expireAt > :now) " +
            "ORDER BY n.createAt DESC")
    Page<Notice> findVisible(@Param("now") LocalDateTime now, Pageable pageable);
}
