package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobSearchResponse;
import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 테스트/디버그용 FotMob 프록시.
 * DB 저장 없이 Python 스크래퍼 결과를 그대로 확인한다(끝난 경기 미리보기 등).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/fotmob")
public class FotmobDebugController {

    private final FotmobClient fotmobClient;
    private final FotmobScheduleService scheduleService;
    private final FotmobStandingService standingService;
    private final FotmobPollScheduler pollScheduler;

    /** 리그 순위 조회 (competitionId = 내부 Competition PK, 페이지당 8). */
    @GetMapping("/standings/{competitionId}")
    public ResponseEntity<CommonResponse<?>> standings(
            @PathVariable Long competitionId,
            @PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity.ok(
                CommonResponse.success("순위 조회 성공", standingService.getStandings(competitionId, pageable)));
    }

    /** 리그 순위 강제 갱신. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/standings/{competitionId}/sync")
    public ResponseEntity<CommonResponse<?>> syncStandings(
            @PathVariable Long competitionId,
            @PageableDefault(size = 8) Pageable pageable) {
        standingService.syncStandings(competitionId);
        return ResponseEntity.ok(
                CommonResponse.success("순위 갱신 완료", standingService.getStandings(competitionId, pageable)));
    }

    /** 폴링 주기(분) 조회. */
    @GetMapping("/poll-interval")
    public ResponseEntity<CommonResponse<?>> getPollInterval() {
        return ResponseEntity.ok(
                CommonResponse.success("조회 성공", pollScheduler.getIntervalMinutes()));
    }

    /** 폴링 주기(분) 변경 (관리자). */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/poll-interval")
    public ResponseEntity<CommonResponse<?>> setPollInterval(@RequestParam int minutes) {
        pollScheduler.setIntervalMinutes(minutes);
        return ResponseEntity.ok(
                CommonResponse.success("폴링 주기 변경", pollScheduler.getIntervalMinutes()));
    }

    /** 과거/미래 N일치 일정 동기화 (수동 트리거). 범위는 상한 클램프(과도한 크롤 방지). */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/schedule/sync")
    public ResponseEntity<CommonResponse<?>> scheduleSync(
            @RequestParam(defaultValue = "10") int pastDays,
            @RequestParam(defaultValue = "10") int futureDays) {
        int past = Math.max(0, Math.min(pastDays, 30));
        int future = Math.max(0, Math.min(futureDays, 30));
        int n = scheduleService.syncRange(past, future);
        return ResponseEntity.ok(CommonResponse.success("일정 " + n + "경기 동기화", n));
    }

    /** 특정 날짜(YYYYMMDD) 일정 동기화. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/schedule/sync/{date}")
    public ResponseEntity<CommonResponse<?>> scheduleSyncDate(@PathVariable String date) {
        int n = scheduleService.syncDate(date);
        return ResponseEntity.ok(CommonResponse.success(date + " " + n + "경기 동기화", n));
    }

    /** fotmobMatchId로 라인업·평점·이벤트를 즉시 미리보기 (DB 미저장, 크롤 유발 → 관리자). */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @GetMapping("/preview/{fotmobId}")
    public ResponseEntity<CommonResponse<?>> preview(@PathVariable Long fotmobId) {
        FotmobMatchResponse data = fotmobClient.getMatch(fotmobId);
        return ResponseEntity.ok(CommonResponse.success("미리보기 성공", data));
    }

    /** 팀명/대회로 FotMob 경기 검색 (matchId 후보 확인, 크롤 유발 → 관리자). */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @GetMapping("/search")
    public ResponseEntity<CommonResponse<?>> search(
            @RequestParam String team1,
            @RequestParam(required = false, defaultValue = "") String team2,
            @RequestParam(required = false, defaultValue = "") String competition) {
        FotmobSearchResponse data = fotmobClient.search(team1, team2, competition);
        return ResponseEntity.ok(CommonResponse.success("검색 성공", data));
    }
}
