package com.example.backend.notice;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.notice.dto.NoticeRequest;
import com.example.backend.notice.dto.NoticeView;
import com.example.backend.notify.NtfyClient;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 공지사항 CRUD + 게시 스케줄. 작성/수정/삭제는 관리자(컨트롤러에서 @PreAuthorize 보호), 조회는 공개.
 * 게시창(publishAt~expireAt)은 배치 없이 조회 시점 필터로 처리 — 시각이 되면 자동으로 보이고/내려간다.
 */
@Service
@RequiredArgsConstructor
public class NoticeService {

    private final NoticeRepository noticeRepository;
    private final UserRepository userRepository;
    private final NtfyClient ntfy;

    @Transactional
    public NoticeView create(Long adminUserId, NoticeRequest req) {
        validate(req);
        // 등록 시점에 이미 지난 내림 시각은 등록 실수 → 거절 (수정에선 "지금 내리기" 용도로 허용)
        if (req.expireAt() != null && req.expireAt().isBefore(LocalDateTime.now())) {
            throw new BadRequestException("내림 시각(expireAt)이 이미 지났습니다.");
        }
        User admin = userRepository.findById(adminUserId)
                .orElseThrow(() -> new NotFoundException("작성자를 찾을 수 없습니다."));
        Notice notice = Notice.create(admin.getId(), admin.getName(), req.title().trim(), req.content().trim(),
                req.publishAt(), req.expireAt());
        Notice saved = noticeRepository.save(notice);

        // 즉시 게시(publishAt 없음/과거)면 알림. 예약 게시는 게시창 진입 감지 배치가 없어 알림하지 않는다.
        if (notice.getPublishAt() == null || !notice.getPublishAt().isAfter(LocalDateTime.now())) {
            ntfy.send("Notice",
                    String.format("%s%n%s", req.title().trim(), req.content().trim()),
                    "loudspeaker");
        }
        return NoticeView.from(saved);
    }

    /** 공개 목록 — 게시창 안의 공지만. */
    @Transactional(readOnly = true)
    public Page<NoticeView> list(Pageable pageable) {
        return noticeRepository.findVisible(LocalDateTime.now(), pageable).map(NoticeView::from);
    }

    /** 관리자 목록 — 게시 전(SCHEDULED)/내려간(EXPIRED) 공지 포함 전체. */
    @Transactional(readOnly = true)
    public Page<NoticeView> adminList(Pageable pageable) {
        return noticeRepository.findAllByOrderByCreateAtDesc(pageable).map(NoticeView::from);
    }

    /** 공개 단건 — 게시창 밖(게시 전/내려감)이면 없는 것으로 취급(예약 공지 유출 방지). */
    @Transactional(readOnly = true)
    public NoticeView get(Long id) {
        Notice notice = noticeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("공지를 찾을 수 없습니다."));
        if (!notice.isVisibleAt(LocalDateTime.now())) {
            throw new NotFoundException("공지를 찾을 수 없습니다.");
        }
        return NoticeView.from(notice);
    }

    @Transactional
    public NoticeView update(Long id, NoticeRequest req) {
        validate(req);
        Notice notice = noticeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("공지를 찾을 수 없습니다."));
        notice.edit(req.title().trim(), req.content().trim(), req.publishAt(), req.expireAt());
        return NoticeView.from(notice);
    }

    @Transactional
    public void delete(Long id) {
        if (!noticeRepository.existsById(id)) {
            throw new NotFoundException("공지를 찾을 수 없습니다.");
        }
        noticeRepository.deleteById(id);
    }

    private void validate(NoticeRequest req) {
        if (req == null
                || req.title() == null || req.title().isBlank()
                || req.content() == null || req.content().isBlank()) {
            throw new BadRequestException("제목과 내용을 입력하세요.");
        }
        if (req.publishAt() != null && req.expireAt() != null
                && !req.expireAt().isAfter(req.publishAt())) {
            throw new BadRequestException("내림 시각(expireAt)은 게시 시각(publishAt)보다 뒤여야 합니다.");
        }
    }
}
