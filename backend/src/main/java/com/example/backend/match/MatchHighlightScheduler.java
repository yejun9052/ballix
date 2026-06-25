package com.example.backend.match;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 종료 경기 하이라이트 자동 보강 — 다시보기 영상(replayYoutubeId)이 아직 없는 최근 종료 경기를
 * <b>~30분마다</b> 다시 검색해 채운다.
 *
 * <p>방송사 하이라이트는 경기 종료 후 수십 분~몇 시간 뒤에 업로드되므로, 유저가 상세화면을 열 때까지
 * 기다리지 않고 주기적으로 재시도한다. 검색·선택은 {@link MatchHighlightService}(한국 방송사 채널 +
 * 양 팀 모두 제목에 나오는 영상만)가 담당하므로 <b>엉뚱한 경기를 가져오지 않는다</b>. 영상이 채워지면
 * 그 경기는 대상 쿼리에서 자동으로 빠진다. 후보가 없으면 {@code MatchHighlightService}의 30분 쿨다운이
 * 불필요한 재크롤을 막는다(스케줄러 주기와 정렬됨).
 *
 * <p>안전장치: ① 진행 중(IN_PLAY) 경기가 있으면 이번 tick은 1건만 처리한다(완전 스킵하면 며칠 전 종료
 * 경기도 라이브 경기 때문에 영영 안 채워진다 — 라이브 크롤과의 경합은 1건으로 최소화). ② {@code since-days}
 * 로 오래된 경기는 포기(무한 크롤 방지). ③ 한 tick 처리 건수를 {@code limit} 로 제한.
 *
 * <p>설정(모두 {@code @Value} 기본값 — yml 없이도 동작): {@code match.highlight.backfill.{enabled,tick-ms,since-days,limit}}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MatchHighlightScheduler {

    private final MatchRepository matchRepository;
    private final MatchHighlightService highlightService;

    @Value("${match.highlight.backfill.enabled:true}")
    private boolean enabled;

    /** 최근 N일 내 종료 경기만 재시도(그보다 오래되면 포기). */
    @Value("${match.highlight.backfill.since-days:3}")
    private int sinceDays;

    /** 한 tick에 시도할 최대 경기 수(크롤 부하 제한). */
    @Value("${match.highlight.backfill.limit:5}")
    private int limit;

    // 부팅 2분 뒤부터, 이후 기본 30분(tick-ms)마다.
    @Scheduled(initialDelay = 120_000, fixedDelayString = "${match.highlight.backfill.tick-ms:1800000}")
    public void backfillHighlights() {
        if (!enabled) {
            return;
        }
        // 진행 중 경기가 있으면 1건만(라이브 크롤 경합 최소화), 없으면 limit건 — 검색·선택·쿨다운은 서비스가 담당.
        int effLimit = matchRepository.existsByStatus("IN_PLAY") ? 1 : limit;
        highlightService.backfillHighlights(effLimit, sinceDays);
    }
}
