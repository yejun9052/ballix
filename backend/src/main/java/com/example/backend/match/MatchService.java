package com.example.backend.match;

import com.example.backend.fotmob.FotmobScheduleService;
import com.example.backend.global.exceptopn.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class MatchService {

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    /** lazy-crawl 허용 범위: 오늘 ±N일. 범위 밖 날짜는 크롤하지 않는다(임의 날짜 크롤 폭주 방지). */
    private static final int LAZY_WINDOW_DAYS = 30;

    private final MatchRepository matchRepository;
    private final FotmobScheduleService scheduleService;

    /** 크롤했지만 경기가 0건이던 날짜(음성 캐시) — 같은 빈 날짜를 반복 요청해도 재크롤하지 않는다. */
    private final Set<LocalDate> emptyCrawledDates = ConcurrentHashMap.newKeySet();



    // 대회 상관 X 대회 전부 찾기 (AI 예측 선택 경기를 최상단으로)
    public Page<Match> allMatch(Pageable pageable) {
        return matchRepository.findAllByOrderByPredictionEnabledDescMatchTimeAsc(pageable);
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

        // add()가 true면 = 이 빈 날짜를 처음 크롤하는 것(동시요청도 한 번만 통과). 범위 밖/이미 크롤한 날짜는 스킵.
        if (!exists && isCrawlable(matchDay) && emptyCrawledDates.add(matchDay)) {
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

    /** lazy-crawl 허용 날짜인지(오늘 ±LAZY_WINDOW_DAYS). 범위 밖이면 DB만 보고 크롤은 하지 않는다. */
    private boolean isCrawlable(LocalDate date) {
        LocalDate today = LocalDate.now();
        return !date.isBefore(today.minusDays(LAZY_WINDOW_DAYS))
                && !date.isAfter(today.plusDays(LAZY_WINDOW_DAYS));
    }

    // 다가오는 경기 찾기 (compId 주면 그 대회만, 없으면 전체)
    public Page<Match> upcoming(Long compId, Pageable pageable) {
        LocalDateTime now = LocalDateTime.now();

        if (compId == null) return matchRepository.findByMatchTimeAfterOrderByMatchTimeAsc(now, pageable);

        return matchRepository.findByMatchTimeAfterAndCompetitionIdOrderByMatchTimeAsc(now, compId, pageable);
    }

}
