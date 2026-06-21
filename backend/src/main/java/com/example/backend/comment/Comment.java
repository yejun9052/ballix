package com.example.backend.comment;

import com.example.backend.global.common.BaseTimeEntity;
import com.example.backend.match.Match;
import com.example.backend.user.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 경기별 댓글. 한 유저(User)가 한 경기(Match)에 남긴 글.
 * 라인업/이벤트처럼 Match와 연관관계로 묶되, 작성자 식별을 위해 User도 LAZY로 둔다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "comments", indexes = @Index(name = "idx_comment_match", columnList = "match_id"))
public class Comment extends BaseTimeEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user; // 작성자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "match_id", nullable = false)
    private Match match; // 어떤 경기

    @Column(nullable = false, length = 500)
    private String content; // 댓글 내용(최대 500자)

    public static Comment create(User user, Match match, String content) {
        return Comment.builder()
                .user(user)
                .match(match)
                .content(content)
                .build();
    }
}
