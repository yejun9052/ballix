package com.example.backend.notice.dto;

/** 공지 등록/수정 요청 본문(JSON). */
public record NoticeRequest(
        String title,
        String content
) {}
