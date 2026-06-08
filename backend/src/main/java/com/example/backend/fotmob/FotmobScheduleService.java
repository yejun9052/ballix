package com.example.backend.fotmob;

import com.example.backend.competition.Competition;
import com.example.backend.competition.CompetitionRepository;
import com.example.backend.competition.enums.CompType;
import com.example.backend.fotmob.dto.FotmobScheduleResponse;
import com.example.backend.fotmob.dto.FotmobScheduleResponse.ScheduledMatch;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.team.Team;
import com.example.backend.team.TeamRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    // "World Cup Grp. A" → 그룹명 "Grp. A" 분리
    private static final Pattern GROUP_PAT = Pattern.compile("\\s*(Grp\\.?\\s*\\w+|Group\\s*\\w+)\\s*$", Pattern.CASE_INSENSITIVE);

    @Value("${fotmob.schedule.leagues:World Cup,Friendlies}")
    private String leaguesFilter;

    /** 과거~미래 N일치 일정을 동기화. */
    @Transactional
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

    /** 특정 날짜(YYYYMMDD) 일정 동기화. */
    @Transactional
    public int syncDate(String date) {
        FotmobScheduleResponse resp = fotmobClient.getSchedule(date, leaguesFilter);
        if (resp == null || resp.matches() == null || resp.matches().isEmpty()) {
            return 0;
        }
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

        Match existing = matchRepository.findByFotmobMatchId(sm.matchId()).orElse(null);
        if (existing != null) {
            existing.updateSchedule(kickoffKst, null, groupName, status);
            existing.updateScore(status, sm.homeScore(), sm.awayScore(), winner);
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
                        .type(CompType.CUP)
                        .emblem("")
                        .build()));
    }

    /** UTC ISO 문자열을 KST(UTC+9) LocalDateTime으로. */
    private LocalDateTime toKst(String utcTime) {
        if (utcTime == null || utcTime.isBlank()) {
            return LocalDateTime.now();
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
