package com.example.backend.match;

import com.example.backend.fotmob.FotmobScheduleService;
import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class MatchService {

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    /** lazy-crawl 허용 범위: 오늘 ±N일. 범위 밖 날짜는 크롤하지 않는다(임의 날짜 크롤 폭주 방지). */
    private static final int LAZY_WINDOW_DAYS = 30;
    /** 음성 캐시 TTL(분) — 이 시간이 지나면 빈 날짜라도 한 번 더 크롤 시도(나중에 경기가 추가됐을 수 있음). */
    private static final long NEG_CACHE_TTL_MINUTES = 30;
    /** 음성 캐시 최대 항목 수 — 초과 시 만료 항목부터 정리해 무한 증가를 막는다. */
    private static final int NEG_CACHE_MAX = 500;

    private final MatchRepository matchRepository;
    private final FotmobScheduleService scheduleService;

    /** 크롤했지만 경기가 0건이던 날짜 → 크롤 시각(음성 캐시). 같은 빈 날짜의 반복 재크롤을 TTL 동안 억제. */
    private final Map<LocalDate, Long> emptyCrawledDates = new ConcurrentHashMap<>();



    // 대회 상관 X 대회 전부 찾기 (IN_PLAY 최상단, 그 다음 AI 예측 선택 경기, 그 뒤 matchTime ASC)
    public Page<Match> allMatch(Pageable pageable) {
        return matchRepository.findAllSorted(pageable);
    }

    // 특정 대회 경기 전부 찾기
    public Page<Match> findByCompId(Long compId, Pageable pageable) {
        return matchRepository.findByCompetitionId(compId, pageable);
    }

    // 날짜 대입 경기 찾기 — DB에 없으면 그 날짜를 즉시 크롤·저장 후 재조회(DB-first lazy).
    // ① 오늘 ±LAZY_WINDOW_DAYS 범위 밖이면 크롤하지 않음(임의 날짜 폭주 차단)
    // ② 크롤해도 0건이던 날짜는 음성 캐시에 기억해 재크롤하지 않음(빈 날짜 반복 요청 비용 제거)
    public Page<Match> findByDate(LocalDate matchDay, Pageable pageable) {
        boolean exists = matchRepository.existsByMatchDate(matchDay);

        // claim()이 true면 = 이 빈 날짜를 처음(또는 TTL 만료 후) 크롤하는 것(동시요청도 한 번만 통과).
        // 범위 밖/TTL 내 이미 크롤한 날짜는 스킵.
        if (!exists && isCrawlable(matchDay) && claimEmptyDate(matchDay)) {
            boolean crawled = false;
            try {
                int n = scheduleService.syncDate(matchDay.format(YMD));
                crawled = true;
                log.info("[match] {} DB 비어있어 lazy 크롤 → {}경기 저장", matchDay, n);
            } catch (Exception e) {
                emptyCrawledDates.remove(matchDay);   // 실패(예: Python 다운)는 음성캐시에 남기지 않음 → 다음에 재시도 허용
                log.warn("[match] {} lazy 크롤 실패: {}", matchDay, e.getMessage());
            }
            if (crawled) {
                exists = matchRepository.existsByMatchDate(matchDay);
                if (exists) {
                    emptyCrawledDates.remove(matchDay);  // 경기가 생겼으니 캐시에서 제거(이후엔 DB에서 바로 잡힘)
                }
            }
        }

        if (!exists) {
            throw new NotFoundException("날짜에 맞는 매치를 찾을 수 없습니다.");
        }
        return matchRepository.findByMatchDate(matchDay, pageable);
    }

    /**
     * 빈 날짜 크롤 권한을 선점한다(원자적). 처음이거나 TTL이 지난 날짜면 true(크롤 진행),
     * TTL 내 이미 크롤한 날짜면 false(스킵). 호출 시 만료 항목·초과분을 정리해 메모리 무한 증가를 막는다.
     */
    private boolean claimEmptyDate(LocalDate date) {
        long now = System.currentTimeMillis();
        long ttlMs = NEG_CACHE_TTL_MINUTES * 60_000;

        Long prev = emptyCrawledDates.get(date);
        if (prev != null && now - prev > ttlMs) {
            emptyCrawledDates.remove(date, prev);   // 만료 → 재크롤 허용
        }
        if (emptyCrawledDates.size() >= NEG_CACHE_MAX) {
            emptyCrawledDates.entrySet().removeIf(e -> now - e.getValue() > ttlMs);
        }
        return emptyCrawledDates.putIfAbsent(date, now) == null;
    }

    /** lazy-crawl 허용 날짜인지(오늘 ±LAZY_WINDOW_DAYS). 범위 밖이면 DB만 보고 크롤은 하지 않는다. */
    private boolean isCrawlable(LocalDate date) {
        LocalDate today = LocalDate.now();
        return !date.isBefore(today.minusDays(LAZY_WINDOW_DAYS))
                && !date.isAfter(today.plusDays(LAZY_WINDOW_DAYS));
    }

    // 팀 이름으로 경기 검색(관리자 UI에서 matchId 대신 팀명으로 찾기). status 주면 해당 상태만.
    public Page<Match> search(String q, String status, Pageable pageable) {
        String query = q == null ? "" : q.trim();
        if (query.isBlank()) {
            return Page.empty(pageable);
        }
        String st = (status == null || status.isBlank()) ? null : status.trim();
        return matchRepository.searchByTeamName(query, st, pageable);
    }

    // 다가오는 경기 찾기 (compId 주면 그 대회만, 없으면 전체)
    public Page<Match> upcoming(Long compId, Pageable pageable) {
        LocalDateTime now = LocalDateTime.now();

        if (compId == null) return matchRepository.findByMatchTimeAfterOrderByMatchTimeAsc(now, pageable);

        return matchRepository.findByMatchTimeAfterAndCompetitionIdOrderByMatchTimeAsc(now, compId, pageable);
    }

    // ── 다시보기(유튜브) ───────────────────────────────────────────────

    /** videoId 11자 형식. */
    private static final Pattern YT_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    /** 유튜브 URL에서 videoId 추출: watch?v= / youtu.be/ / shorts/ / live/ / embed/ 지원. */
    private static final Pattern YT_URL = Pattern.compile(
            "(?:youtube\\.com/(?:watch\\?(?:[^#]*&)?v=|shorts/|live/|embed/)|youtu\\.be/)([A-Za-z0-9_-]{11})");

    /** 종료 경기에 유튜브 다시보기 등록(관리자). videoId 또는 유튜브 URL 그대로 입력 가능. */
    @Transactional
    public Match setReplay(Long matchId, String youtube) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다. id=" + matchId));

        if (!"FINISHED".equals(match.getStatus())) {
            throw new BadRequestException("종료된 경기에만 다시보기를 등록할 수 있습니다.");
        }
        match.applyReplay(extractYoutubeId(youtube));
        return match;
    }

    /** 다시보기 해제(관리자). */
    @Transactional
    public Match clearReplay(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다. id=" + matchId));
        match.clearReplay();
        return match;
    }

    /** videoId(11자)면 그대로, 유튜브 URL이면 videoId를 추출. 둘 다 아니면 거절. */
    private String extractYoutubeId(String input) {
        if (input == null || input.isBlank()) {
            throw new BadRequestException("유튜브 videoId 또는 URL을 입력하세요.");
        }
        String s = input.trim();
        if (YT_ID.matcher(s).matches()) {
            return s;
        }
        Matcher m = YT_URL.matcher(s);
        if (m.find()) {
            return m.group(1);
        }
        throw new BadRequestException("유튜브 videoId(11자) 또는 유튜브 URL 형식이 아닙니다: " + input);
    }

}
