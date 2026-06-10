package com.example.backend.notice;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 관리자 공지사항. 작성자(관리자) id/이름을 함께 저장해 표시용으로 쓴다.
 * 예) "다가오는 12일 11시에 진행하는 한국 vs 체코 많은 응원 부탁드립니다."
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

    public static Notice create(Long authorId, String authorName, String title, String content) {
        return Notice.builder()
                .authorId(authorId)
                .authorName(authorName)
                .title(title)
                .content(content)
                .build();
    }

    public void edit(String title, String content) {
        if (title != null && !title.isBlank()) this.title = title;
        if (content != null && !content.isBlank()) this.content = content;
    }
}
