package com.example.backend.fotmob;

import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 종료경기 상세 선반영(prewarm) 스케줄러 단위 테스트 — 안전장치 검증.
 *  1) IN_PLAY 경기가 있으면 통째로 건너뛴다(라이브 크롤과 경쟁 방지).
 *  2) 한 tick당 limit건까지만 크롤한다.
 *  3) 같은 경기는 쿨다운 동안 재크롤하지 않는다(빈 라인업 경기 폭주 방지).
 *  4) enabled=false면 아무 것도 하지 않는다.
 * DB/스크래퍼 없이 Mockito로만 — {@link AiLivePredictionSchedulerTest} 스타일을 따른다.
 */
class FotmobPrewarmSchedulerTest {

    private MatchRepository matchRepository;
    private FotmobSyncService syncService;
    private FotmobScheduleService scheduleService;
    private FotmobPollScheduler scheduler;

    @BeforeEach
    void setUp() {
        matchRepository = mock(MatchRepository.class);
        syncService = mock(FotmobSyncService.class);
        scheduleService = mock(FotmobScheduleService.class);
        scheduler = new FotmobPollScheduler(matchRepository, syncService, scheduleService);
        ReflectionTestUtils.setField(scheduler, "pollEnabled", true);
        ReflectionTestUtils.setField(scheduler, "prewarmEnabled", true);
        ReflectionTestUtils.setField(scheduler, "prewarmSinceDays", 7);
        ReflectionTestUtils.setField(scheduler, "prewarmLimit", 3);
        ReflectionTestUtils.setField(scheduler, "prewarmCooldownHours", 6);
        // 기본: 진행 중 경기 없음
        when(matchRepository.findByStatusAndFotmobMatchIdIsNotNull("IN_PLAY")).thenReturn(List.of());
    }

    // ── 헬퍼 ─────────────────────────────────────────────
    private Match finishedMatch(long id) {
        Match m = Match.builder().status("FINISHED").fotmobMatchId(id).build();
        ReflectionTestUtils.setField(m, "id", id);
        return m;
    }

    private void givenTargets(Match... matches) {
        when(matchRepository.findDetailBackfillTargets(any(), any(Pageable.class)))
                .thenReturn(List.of(matches));
    }

    // ── 테스트 ───────────────────────────────────────────

    @Test
    @DisplayName("IN_PLAY 경기가 있으면 선반영을 통째로 건너뛴다")
    void skipsEntirelyWhenAnyMatchIsLive() {
        when(matchRepository.findByStatusAndFotmobMatchIdIsNotNull("IN_PLAY"))
                .thenReturn(List.of(finishedMatch(99L)));   // (상태 무관, 단지 비어있지 않음)
        givenTargets(finishedMatch(1L), finishedMatch(2L));

        scheduler.prewarmFinishedDetails();

        verify(syncService, never()).syncMatch(any());
    }

    @Test
    @DisplayName("한 tick당 limit(3)건까지만 크롤한다")
    void crawlsUpToLimitPerTick() {
        givenTargets(finishedMatch(1L), finishedMatch(2L), finishedMatch(3L),
                finishedMatch(4L), finishedMatch(5L));

        scheduler.prewarmFinishedDetails();

        verify(syncService, times(3)).syncMatch(any());
    }

    @Test
    @DisplayName("쿨다운 중인 경기는 재크롤하지 않고 다음 경기로 넘어간다")
    void respectsCooldownAcrossTicks() {
        Match m1 = finishedMatch(1L), m2 = finishedMatch(2L), m3 = finishedMatch(3L),
                m4 = finishedMatch(4L), m5 = finishedMatch(5L);
        givenTargets(m1, m2, m3, m4, m5);

        scheduler.prewarmFinishedDetails();   // m1,m2,m3 크롤
        scheduler.prewarmFinishedDetails();   // m1~m3 쿨다운 → m4,m5 크롤
        scheduler.prewarmFinishedDetails();   // 전부 쿨다운 → 0건

        // 5개 경기가 각 1회씩만 크롤됨(중복 없음)
        verify(syncService, times(1)).syncMatch(eq(m1));
        verify(syncService, times(1)).syncMatch(eq(m4));
        verify(syncService, times(5)).syncMatch(any());
    }

    @Test
    @DisplayName("크롤 실패(예외)도 쿨다운에 기록돼 즉시 재크롤하지 않는다")
    void failedCrawlAlsoCoolsDown() {
        Match m1 = finishedMatch(1L);
        givenTargets(m1);
        org.mockito.Mockito.doThrow(new RuntimeException("scraper down"))
                .when(syncService).syncMatch(eq(m1));

        scheduler.prewarmFinishedDetails();   // 1회 시도(실패) → 쿨다운 기록
        scheduler.prewarmFinishedDetails();   // 쿨다운 → 재시도 안 함

        verify(syncService, times(1)).syncMatch(eq(m1));
    }

    @Test
    @DisplayName("prewarmEnabled=false면 아무 것도 하지 않는다")
    void disabledDoesNothing() {
        ReflectionTestUtils.setField(scheduler, "prewarmEnabled", false);
        givenTargets(finishedMatch(1L), finishedMatch(2L));

        scheduler.prewarmFinishedDetails();

        verify(syncService, never()).syncMatch(any());
    }
}
