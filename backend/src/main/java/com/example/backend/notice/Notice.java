package com.example.backend.notice;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 관리자 공지사항. 작성자(관리자) id/이름을 함께 저장해 표시용으로 쓴다.
 * 예) "다가오는 12일 11시에 진행하는 한국 vs 체코 많은 응원 부탁드립니다."
 *
 * 게시 스케줄: publishAt(이 시각부터 공개, null=즉시) ~ expireAt(이 시각에 내림, null=무기한).
 * 별도 배치 없이 공개 조회 쿼리가 현재 시각으로 창(window)을 필터한다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "notices")
public class Notice extends BaseTimeEntity {

    @Column(nullable = false)
    private String title; // 제목

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content; // 내용

    @Column(nullable = false)
    private Long authorId; // 작성 관리자 id

    @Column(nullable = false)
    private String authorName; // 작성 관리자 이름(표시용)

    /** 게시 시작 시각. null이면 즉시 게시. */
    @Column(name = "publish_at", nullable = true)
    private LocalDateTime publishAt;

    /** 게시 종료(내림) 시각. null이면 무기한. */
    @Column(name = "expire_at", nullable = true)
    private LocalDateTime expireAt;

    public static Notice create(Long authorId, String authorName, String title, String content,
                                LocalDateTime publishAt, LocalDateTime expireAt) {
        return Notice.builder()
                .authorId(authorId)
                .authorName(authorName)
                .title(title)
                .content(content)
                .publishAt(publishAt)
                .expireAt(expireAt)
                .build();
    }

    /** 제목/내용은 값이 있을 때만 교체, 게시창(publishAt/expireAt)은 보낸 값으로 그대로 교체(null=즉시/무기한). */
    public void edit(String title, String content, LocalDateTime publishAt, LocalDateTime expireAt) {
        if (title != null && !title.isBlank()) this.title = title;
        if (content != null && !content.isBlank()) this.content = content;
        this.publishAt = publishAt;
        this.expireAt = expireAt;
    }

    /** 지금 공개 상태인지 (게시창 안인지). */
    public boolean isVisibleAt(LocalDateTime now) {
        boolean published = publishAt == null || !publishAt.isAfter(now);
        boolean notExpired = expireAt == null || expireAt.isAfter(now);
        return published && notExpired;
    }
}
