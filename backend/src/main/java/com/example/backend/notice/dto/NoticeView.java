package com.example.backend.notice.dto;

import com.example.backend.notice.Notice;

import java.time.LocalDateTime;

/** 공지 응답 DTO. status: SCHEDULED(게시 전) / ACTIVE(게시 중) / EXPIRED(내려감) — 관리자 목록 표시용. */
public record NoticeView(
        Long id,
        String title,
        String content,
        String authorName,
        LocalDateTime createAt,
        LocalDateTime publishAt,
        LocalDateTime expireAt,
        String status
) {
    public static NoticeView from(Notice n) {
        return new NoticeView(n.getId(), n.getTitle(), n.getContent(), n.getAuthorName(), n.getCreateAt(),
                n.getPublishAt(), n.getExpireAt(), statusOf(n));
    }

    private static String statusOf(Notice n) {
        LocalDateTime now = LocalDateTime.now();
        if (n.getPublishAt() != null && n.getPublishAt().isAfter(now)) return "SCHEDULED";
        if (n.getExpireAt() != null && !n.getExpireAt().isAfter(now)) return "EXPIRED";
        return "ACTIVE";
    }
}
