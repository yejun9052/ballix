package com.example.backend.notice;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.notice.dto.NoticeRequest;
import com.example.backend.notice.dto.NoticeView;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공지사항 CRUD. 작성/수정/삭제는 관리자(컨트롤러에서 @PreAuthorize 보호), 조회는 공개.
 */
@Service
@RequiredArgsConstructor
public class NoticeService {

    private final NoticeRepository noticeRepository;
    private final UserRepository userRepository;

    @Transactional
    public NoticeView create(Long adminUserId, NoticeRequest req) {
        validate(req);
        User admin = userRepository.findById(adminUserId)
                .orElseThrow(() -> new NotFoundException("작성자를 찾을 수 없습니다."));
        Notice notice = Notice.create(admin.getId(), admin.getName(), req.title().trim(), req.content().trim());
        return NoticeView.from(noticeRepository.save(notice));
    }

    @Transactional(readOnly = true)
    public Page<NoticeView> list(Pageable pageable) {
        return noticeRepository.findAllByOrderByCreateAtDesc(pageable).map(NoticeView::from);
    }

    @Transactional(readOnly = true)
    public NoticeView get(Long id) {
        return NoticeView.from(noticeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("공지를 찾을 수 없습니다.")));
    }

    @Transactional
    public NoticeView update(Long id, NoticeRequest req) {
        validate(req);
        Notice notice = noticeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("공지를 찾을 수 없습니다."));
        notice.edit(req.title().trim(), req.content().trim());
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
    }
}
