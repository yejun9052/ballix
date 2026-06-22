package com.example.backend.fotmob;

import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobSearchResponse;
import com.example.backend.global.common.CommonResponse;
import com.example.backend.team.Team;
import com.example.backend.team.TeamRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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
    private final FotmobSyncService syncService;
    private final FotmobStandingService standingService;
    private final FotmobPollScheduler pollScheduler;
    private final TeamRepository teamRepository;

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
        n += scheduleService.syncFullLeagues();   // 월드컵 등 시즌 전체(결승 대진 확정 갱신 포함)
        return ResponseEntity.ok(CommonResponse.success("일정 " + n + "경기 동기화", n));
    }

    /** 예상 브래킷(32강 예상 대진) 동기화 (수동 트리거) — 토너먼트 경기에 stage·대진 반영. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/playoff/sync")
    public ResponseEntity<CommonResponse<?>> playoffSync() {
        int n = scheduleService.syncPlayoffLeagues();
        return ResponseEntity.ok(CommonResponse.success("예상 브래킷 " + n + "대진 동기화", n));
    }

    /**
     * 팀(나라) 이름 전체 재번역 (수동 트리거) — 아직 한국어 이름(nameKo)이 없는 팀만 골라 Gemini로 번역해 채운다.
     * '전체 재번역' 버튼용. 이미 번역된 팀은 건드리지 않는다(다시 번역하려면 해당 nameKo를 비워야 함).
     */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/teams/translate")
    public ResponseEntity<CommonResponse<?>> translateTeams() {
        int n = scheduleService.translateMissingTeamNames();
        return ResponseEntity.ok(CommonResponse.success("팀 이름 " + n + "건 한국어 번역", n));
    }

    /**
     * 상세(라인업·이벤트) 누락 경기 일괄 보강 (관리자).
     * 최근 sinceDays 일 내 시작된 경기 중 라인업이 비어 있는(크롤 실패 등) 경기를 limit건까지 다시 크롤한다.
     * 스크래퍼가 직렬화/throttle 하므로 안전. 건수가 많으면 시간이 걸리니 limit를 나눠 여러 번 눌러 이어서 처리한다.
     */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/details/backfill")
    public ResponseEntity<CommonResponse<?>> backfillDetails(
            @RequestParam(defaultValue = "14") int sinceDays,
            @RequestParam(defaultValue = "8") int limit) {
        int n = syncService.backfillMissingDetails(sinceDays, limit);
        return ResponseEntity.ok(CommonResponse.success("상세 " + n + "경기 보강", n));
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

    /**
     * 팀명/대회로 FotMob 경기 검색 (matchId 후보 확인, 크롤 유발 → 관리자).
     * 한글 팀명으로 검색하면 DB의 한국어 이름(nameKo)으로 영문명을 찾아 FotMob에 질의한다 — 한글/영어 둘 다 가능.
     */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @GetMapping("/search")
    public ResponseEntity<CommonResponse<?>> search(
            @RequestParam String team1,
            @RequestParam(required = false, defaultValue = "") String team2,
            @RequestParam(required = false, defaultValue = "") String competition) {
        FotmobSearchResponse data = fotmobClient.search(
                resolveTeamQuery(team1), resolveTeamQuery(team2), competition);
        return ResponseEntity.ok(CommonResponse.success("검색 성공", data));
    }

    /** 한글 검색어면 DB에서 nameKo 부분일치 팀을 찾아 영문명으로 치환(FotMob 검색은 영문). 못 찾으면 원문 유지. */
    private String resolveTeamQuery(String token) {
        if (token == null || token.isBlank()) return token;
        boolean hasHangul = token.codePoints().anyMatch(c -> c >= 0xAC00 && c <= 0xD7A3);
        if (!hasHangul) return token;
        return teamRepository.findByNameKoLike(token.trim(), PageRequest.of(0, 1)).stream()
                .findFirst().map(Team::getName).orElse(token);
    }
}
