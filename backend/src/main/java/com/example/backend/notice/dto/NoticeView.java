package com.example.backend.notice.dto;

import com.example.backend.notice.Notice;

import java.time.LocalDateTime;

/** 공지 응답 DTO. */
public record NoticeView(
        Long id,
        String title,
        String content,
        String authorName,
        LocalDateTime createAt
) {
    public static NoticeView from(Notice n) {
        return new NoticeView(n.getId(), n.getTitle(), n.getContent(), n.getAuthorName(), n.getCreateAt());
    }
}
