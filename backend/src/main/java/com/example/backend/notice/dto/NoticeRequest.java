package com.example.backend.notice.dto;

import java.time.LocalDateTime;

/**
 * 공지 등록/수정 요청 본문(JSON).
 * publishAt/expireAt 는 ISO-8601 (예: "2026-06-15T09:00:00").
 * publishAt null = 즉시 게시, expireAt null = 무기한.
 */
public record NoticeRequest(
        String title,
        String content,
        LocalDateTime publishAt,
        LocalDateTime expireAt
) {}
