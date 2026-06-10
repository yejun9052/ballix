package com.example.backend.notice;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeRepository extends JpaRepository<Notice, Long> {

    // 최신 공지부터 (페이지네이션)
    Page<Notice> findAllByOrderByCreateAtDesc(Pageable pageable);
}
