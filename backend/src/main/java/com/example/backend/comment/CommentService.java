package com.example.backend.comment;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.example.backend.user.enums.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 경기별 댓글 — 조회는 공개, 작성/삭제는 로그인 필요.
 * 삭제는 본인 댓글 또는 관리자(ADMIN_USER)만 가능.
 * 인증은 다른 도메인과 동일하게 컨트롤러에서 받은 {@code userId}(@AuthenticationPrincipal)로 서비스에서 검증한다.
 */
@Service
@RequiredArgsConstructor
public class CommentService {

    private static final int MAX_LENGTH = 500;

    private final CommentRepository commentRepository;
    private final UserRepository userRepository;
    private final MatchRepository matchRepository;

    // 댓글 작성 (로그인 필요)
    @Transactional
    public CommentView create(Long userId, Long matchId, String content) {
        notLogin(userId);

        String body = content == null ? "" : content.trim();
        if (body.isEmpty()) {
            throw new BadRequestException("댓글 내용을 입력하세요.");
        }
        if (body.length() > MAX_LENGTH) {
            throw new BadRequestException("댓글은 " + MAX_LENGTH + "자 이하로 입력하세요.");
        }

        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );
        Match match = matchRepository.findById(matchId).orElseThrow(
                () -> new NotFoundException("경기를 찾을 수 없습니다.")
        );

        Comment saved = commentRepository.save(Comment.create(user, match, body));
        return CommentView.from(saved, userId);
    }

    // 특정 경기 댓글 목록 (공개, 최신순). currentUserId는 mine 표시용(비로그인이면 null).
    @Transactional(readOnly = true)
    public Page<CommentView> list(Long matchId, Long currentUserId, Pageable pageable) {
        return commentRepository.findByMatchIdOrderByCreateAtDesc(matchId, pageable)
                .map(c -> CommentView.from(c, currentUserId));
    }

    // 댓글 삭제 (본인 또는 관리자)
    @Transactional
    public void delete(Long userId, Long commentId) {
        notLogin(userId);

        Comment comment = commentRepository.findById(commentId).orElseThrow(
                () -> new NotFoundException("댓글을 찾을 수 없습니다.")
        );
        User user = userRepository.findById(userId).orElseThrow(
                () -> new NotFoundException("유저를 찾을 수 없습니다.")
        );

        boolean isAuthor = comment.getUser() != null && comment.getUser().getId().equals(userId);
        boolean isAdmin = user.getRole() == Role.ADMIN_USER;
        if (!isAuthor && !isAdmin) {
            throw new UnauthorizedException("본인 댓글만 삭제할 수 있습니다.");
        }

        commentRepository.delete(comment);
    }

    private void notLogin(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
    }
}
