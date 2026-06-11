package com.example.backend.fotmob;

import com.example.backend.competition.Competition;
import com.example.backend.competition.CompetitionRepository;
import com.example.backend.competition.enums.CompType;
import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobScheduleResponse;
import com.example.backend.fotmob.dto.FotmobScheduleResponse.ScheduledMatch;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.prediction.PredictionService;
import com.example.backend.team.Team;
import com.example.backend.team.TeamRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * FotMob 날짜별 일정을 가져와 Team/Competition/Match를 업서트한다.
 * FotMob matchId가 처음부터 들어오므로 별도 매핑이 필요 없다.
 * 시각은 한국시간(KST, UTC+9)으로 저장한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FotmobScheduleService {

    private final FotmobClient fotmobClient;
    private final MatchRepository matchRepository;
    private final TeamRepository teamRepository;
    private final CompetitionRepository competitionRepository;
    private final PredictionService predictionService;

    /** 자기 자신의 프록시. 날짜별 저장(persistSchedule)을 독립 트랜잭션으로 커밋하기 위해
     *  내부호출이 아닌 프록시 경유로 부른다(같은 빈 self-invocation은 @Transactional이 무시됨). */
    @Lazy
    @Autowired
    private FotmobScheduleService self;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    // "World Cup Grp. A" → 그룹명 "Grp. A" 분리
    private static final Pattern GROUP_PAT = Pattern.compile("\\s*(Grp\\.?\\s*\\w+|Group\\s*\\w+)\\s*$", Pattern.CASE_INSENSITIVE);
    /** 구장 보강은 향후 N일 이내 예정 경기만 — 먼 미래(결승 등)까지 미리 크롤하는 폭주 방지(가까워지면 채워짐). */
    private static final int VENUE_ENRICH_AHEAD_DAYS = 14;

    @Value("${fotmob.schedule.leagues:World Cup,Friendlies}")
    private String leaguesFilter;

    /** 시즌 전체 일정으로 받을 리그 leagueId(쉼표구분). 월드컵 등 토너먼트 — 결승까지 한 번에. */
    @Value("${fotmob.schedule.full-season-leagues:}")
    private String fullSeasonLeaguesCsv;

    /**
     * 과거~미래 N일치 일정을 동기화.
     * 트랜잭션을 전 범위로 묶지 않는다 — 날짜마다 크롤→저장을 독립 처리해
     * 하루치가 끝날 때마다 바로 커밋되게 한다(16분짜리 단일 트랜잭션 방지).
     */
    public int syncRange(int pastDays, int futureDays) {
        LocalDate today = LocalDate.now();
        int total = 0;
        for (int d = -pastDays; d <= futureDays; d++) {
            String date = today.plusDays(d).format(DATE_FMT);
            try {
                total += syncDate(date);
            } catch (Exception e) {
                log.warn("[fotmob-schedule] {} 동기화 실패: {}", date, e.getMessage());
            }
        }
        log.info("[fotmob-schedule] 범위 동기화 완료: {}일치 {}경기", pastDays + futureDays + 1, total);
        return total;
    }

    /**
     * 특정 날짜(YYYYMMDD) 일정 동기화.
     * 크롤(네트워크 I/O)은 트랜잭션 밖에서 수행해 DB 커넥션을 점유하지 않고,
     * 저장만 프록시 경유 persistSchedule로 넘겨 날짜 단위 독립 트랜잭션으로 커밋한다.
     */
    public int syncDate(String date) {
        FotmobScheduleResponse resp = fotmobClient.getSchedule(date, leaguesFilter);
        if (resp == null || resp.matches() == null || resp.matches().isEmpty()) {
            return 0;
        }
        int count = self.persistSchedule(date, resp);
        enrichScheduledVenues(resp);   // 저장 커밋 후(트랜잭션 밖) 예정 경기 구장 보강
        return count;
    }

    /**
     * 예정 경기의 구장 이름을 상세 크롤로 채운다 — 일정 데이터엔 구장이 없어 경기 상세를 따로 긁어야 한다.
     * venue가 아직 없는 SCHEDULED 경기만 대상이라 한 번 채워지면 다음 동기화부터 스킵(멱등, 크롤 부하 점감).
     * 크롤(네트워크 I/O)은 트랜잭션 밖에서 돌리고, 저장만 self.applyVenue로 짧은 독립 트랜잭션에서 커밋한다.
     */
    private void enrichScheduledVenues(FotmobScheduleResponse resp) {
        LocalDateTime venueCutoff = LocalDateTime.now().plusDays(VENUE_ENRICH_AHEAD_DAYS);
        for (ScheduledMatch sm : resp.matches()) {
            if (sm.matchId() == null) continue;
            if (sm.started() || sm.finished() || sm.cancelled()) continue;   // 예정 경기만(진행/종료는 폴링이 채움)

            Match m = matchRepository.findByFotmobMatchId(sm.matchId()).orElse(null);
            if (m == null) continue;
            if (m.getVenue() != null && !m.getVenue().isBlank()) continue;    // 이미 구장 있으면 스킵
            if (m.getMatchTime() != null && m.getMatchTime().isAfter(venueCutoff)) continue;  // 너무 먼 경기는 가까워지면

            try {
                FotmobMatchResponse detail = fotmobClient.getMatch(sm.matchId());
                if (detail != null && detail.venue() != null && !detail.venue().isBlank()) {
                    self.applyVenue(m.getId(), detail.venue());
                }
            } catch (Exception e) {
                log.warn("[fotmob-schedule] 구장 크롤 실패 fotmobId={} : {}", sm.matchId(), e.getMessage());
            }
        }
    }

    /** 구장 이름만 짧게 반영(단독 트랜잭션). */
    @Transactional
    public void applyVenue(Long matchId, String venue) {
        matchRepository.findById(matchId).ifPresent(m -> m.updateVenue(venue));
    }

    /**
     * 시즌 전체 일정 리그(월드컵 등)를 동기화 — 결승까지 모든 경기를 한 번에 받는다.
     * 날짜 ±N일 방식(syncRange)으로는 못 닿는 먼 미래 경기를 커버한다.
     */
    public int syncFullLeagues() {
        int total = 0;
        for (Long leagueId : parseLeagueIds(fullSeasonLeaguesCsv)) {
            try {
                total += syncFullLeague(leagueId);
            } catch (Exception e) {
                log.warn("[fotmob-schedule] 리그 {} 전체 일정 동기화 실패: {}", leagueId, e.getMessage());
            }
        }
        return total;
    }

    /** 단일 리그의 시즌 전체 일정 동기화. */
    public int syncFullLeague(Long leagueId) {
        FotmobScheduleResponse resp = fotmobClient.getLeagueFixtures(leagueId);
        if (resp == null || resp.matches() == null || resp.matches().isEmpty()) {
            return 0;
        }
        int count = self.persistSchedule("league-" + leagueId, resp);
        enrichScheduledVenues(resp);   // 저장 커밋 후(트랜잭션 밖) 가까운 예정 경기 구장 보강
        log.info("[fotmob-schedule] 리그 {} 전체 일정 {}경기 동기화", leagueId, count);
        return count;
    }

    private java.util.List<Long> parseLeagueIds(String csv) {
        java.util.List<Long> ids = new java.util.ArrayList<>();
        if (csv == null || csv.isBlank()) return ids;
        for (String t : csv.split(",")) {
            String s = t.trim();
            if (s.isEmpty()) continue;
            try { ids.add(Long.parseLong(s)); } catch (NumberFormatException ignored) {}
        }
        return ids;
    }

    /** 크롤 결과를 DB에 업서트(날짜 단위 트랜잭션). */
    @Transactional
    public int persistSchedule(String date, FotmobScheduleResponse resp) {
        int count = 0;
        for (ScheduledMatch sm : resp.matches()) {
            if (sm.matchId() == null || sm.homeId() == null || sm.awayId() == null) {
                continue;
            }
            try {
                upsertMatch(sm);
                count++;
            } catch (Exception e) {
                log.warn("[fotmob-schedule] 경기 저장 실패 fotmobId={} : {}", sm.matchId(), e.getMessage());
            }
        }
        log.info("[fotmob-schedule] {} → {}경기 저장", date, count);
        return count;
    }

    private void upsertMatch(ScheduledMatch sm) {
        Team home = upsertTeam(sm.homeId(), sm.homeName(), sm.homeCrest());
        Team away = upsertTeam(sm.awayId(), sm.awayName(), sm.awayCrest());
        Competition comp = upsertCompetition(sm);

        LocalDateTime kickoffKst = toKst(sm.utcTime());
        String groupName = extractGroup(sm.leagueName());
        String status = resolveStatus(sm);
        String winner = resolveWinner(sm);

        if (kickoffKst == null) {
            log.warn("[fotmob-schedule] utcTime 없는 경기 스킵 fotmobId={}", sm.matchId());
            return;
        }

        Match existing = matchRepository.findByFotmobMatchId(sm.matchId()).orElse(null);
        if (existing != null) {
            boolean wasFinished = "FINISHED".equals(existing.getStatus());
            existing.updateSchedule(kickoffKst, null, groupName, status);
            existing.updateScore(status, sm.homeScore(), sm.awayScore(), winner);
            // 일정 동기화가 FINISHED를 뒤늦게 확인한 경우에도 예측 채점(폴링 창 밖 경기 누락 방지)
            if (!wasFinished && "FINISHED".equals(status)) {
                try {
                    predictionService.gradeMatch(existing);
                } catch (Exception e) {
                    log.warn("[fotmob-schedule] 예측 채점 실패 fotmobId={} : {}", sm.matchId(), e.getMessage());
                }
            }
            return;
        }

        matchRepository.save(Match.builder()
                .fotmobMatchId(sm.matchId())
                .competition(comp)
                .homeTeam(home)
                .awayTeam(away)
                .matchTime(kickoffKst)
                .stage(null)
                .groupName(groupName)
                .status(status)
                .homeScore(sm.homeScore())
                .awayScore(sm.awayScore())
                .winner(winner)
                .build());
    }

    private Team upsertTeam(Long fotmobTeamId, String name, String crest) {
        return teamRepository.findByFotmobTeamId(fotmobTeamId)
                .map(t -> {
                    t.updateInfo(name, crest);
                    return t;
                })
                .orElseGet(() -> teamRepository.save(Team.builder()
                        .fotmobTeamId(fotmobTeamId)
                        .name(name == null ? "" : name)
                        .shortName(name == null ? "" : name)
                        .tla("")
                        .crest(crest == null ? "" : crest)
                        .build()));
    }

    private Competition upsertCompetition(ScheduledMatch sm) {
        // 조별리그는 parentLeagueId(예: 월드컵=77)로 묶고, 그룹은 Match.groupName으로 분리
        Long leagueId = sm.parentLeagueId() != null ? sm.parentLeagueId() : sm.leagueId();
        String name = stripGroup(sm.leagueName());
        return competitionRepository.findByFotmobLeagueId(leagueId)
                .map(c -> {
                    c.updateInfo(name, "");
                    return c;
                })
                .orElseGet(() -> competitionRepository.save(Competition.builder()
                        .fotmobLeagueId(leagueId)
                        .code(leagueId == null ? name : String.valueOf(leagueId))
                        .name(name)
                        .type(resolveType(sm, name))
                        .emblem("")
                        .build()));
    }

    /**
     * FotMob 스케줄엔 컵/리그 구분 플래그가 없어 휴리스틱으로 판단(type은 표시용).
     * 조별 토너먼트(parentLeagueId 존재)나 컵/대회성 이름이면 CUP, 그 외 도메스틱 리그는 LEAGUE.
     */
    private CompType resolveType(ScheduledMatch sm, String name) {
        if (sm.parentLeagueId() != null) {
            return CompType.CUP; // 월드컵/챔스 등 조별 토너먼트
        }
        String n = name == null ? "" : name.toLowerCase();
        if (n.contains("friendl") || n.contains("cup") || n.contains("qualif")
                || n.contains("champions league") || n.contains("europa") || n.contains("conference league")
                || n.contains("nations league") || n.contains("euro") || n.contains("copa")) {
            return CompType.CUP;
        }
        return CompType.LEAGUE;
    }

    /** UTC ISO 문자열을 KST(UTC+9) LocalDateTime으로. utcTime 없으면 null 반환 → 호출부에서 스킵. */
    private LocalDateTime toKst(String utcTime) {
        if (utcTime == null || utcTime.isBlank()) {
            return null;
        }
        return OffsetDateTime.parse(utcTime).plusHours(9).toLocalDateTime();
    }

    private String resolveStatus(ScheduledMatch sm) {
        if (sm.cancelled()) return "CANCELLED";
        if (sm.finished()) return "FINISHED";
        if (sm.started()) return "IN_PLAY";
        return "SCHEDULED";
    }

    private String resolveWinner(ScheduledMatch sm) {
        if (!sm.finished() || sm.homeScore() == null || sm.awayScore() == null) {
            return null;
        }
        int h = sm.homeScore(), a = sm.awayScore();
        if (h > a) return "HOME_TEAM";
        if (a > h) return "AWAY_TEAM";
        return "DRAW";
    }

    private String extractGroup(String leagueName) {
        if (leagueName == null) return null;
        Matcher m = GROUP_PAT.matcher(leagueName);
        return m.find() ? m.group(1).trim() : null;
    }

    private String stripGroup(String leagueName) {
        if (leagueName == null) return "";
        return GROUP_PAT.matcher(leagueName).replaceAll("").trim();
    }
}
