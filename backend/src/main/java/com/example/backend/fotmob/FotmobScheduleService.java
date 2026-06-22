package com.example.backend.fotmob;

import com.example.backend.ai.TranslationService;
import com.example.backend.competition.Competition;
import com.example.backend.competition.CompetitionRepository;
import com.example.backend.competition.enums.CompType;
import com.example.backend.fotmob.dto.FotmobMatchResponse;
import com.example.backend.fotmob.dto.FotmobPlayoffResponse;
import com.example.backend.fotmob.dto.FotmobPlayoffResponse.PlayoffMatch;
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
    private final TranslationService translationService;

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
    /** 한 번에 번역할 팀 수 상한(Gemini 호출당) — 토큰/지연 보호. 나머지는 다음 동기화에서 처리. */
    private static final int TRANSLATE_BATCH_MAX = 80;

    /** 팀명 번역 동시 실행 방지(P5) — 스케줄 동기화와 관리자 수동 재번역이 같은 팀을 중복 번역하지 않게.
     *  재진입 가능(ReentrantLock): 수동 경로가 잡은 락 안에서 배치 enrich를 반복 호출해도 막히지 않음. */
    private final java.util.concurrent.locks.ReentrantLock translateLock = new java.util.concurrent.locks.ReentrantLock();

    @Value("${fotmob.schedule.leagues:World Cup,Friendlies}")
    private String leaguesFilter;

    /** 시즌 전체 일정으로 받을 리그 leagueId(쉼표구분). 월드컵 등 토너먼트 — 결승까지 한 번에. */
    @Value("${fotmob.schedule.full-season-leagues:}")
    private String fullSeasonLeaguesCsv;

    /** 예상 브래킷(playoff)을 동기화할 리그 leagueId(쉼표구분). 비우면 full-season-leagues를 따른다. */
    @Value("${fotmob.schedule.playoff-leagues:}")
    private String playoffLeaguesCsv;

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
        enrichTeamTranslations();      // 새로 들어온 팀(나라) 이름을 한국어로 번역(번역 전=name / 번역 후=nameKo)
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
     * 관리자 수동 트리거: 번역 안 된(nameKo 비어있는) 팀을 **전부** 한국어로 번역한다.
     * 한 번에 TRANSLATE_BATCH_MAX씩 끊어 반복하고, 더 이상 새로 번역되는 게 없으면 멈춘다
     * (번역 실패로 계속 nameKo가 안 채워지는 이름이 있어도 무한루프에 빠지지 않게). 번역된 총 팀 수를 반환.
     */
    public int translateMissingTeamNames() {
        if (!translateLock.tryLock()) {   // 이미 다른 번역이 진행 중이면 중복 실행 안 함(중복 Gemini 호출 방지, P5)
            log.info("[fotmob-schedule] 번역이 이미 진행 중이라 수동 재번역 요청 무시");
            return 0;
        }
        try {
            int total = 0;
            while (true) {
                int saved = enrichTeamTranslations();
                total += saved;
                if (saved == 0) break;   // 이번 배치에서 새로 번역된 게 없으면(대상 없음/전부 실패) 종료
            }
            log.info("[fotmob-schedule] 수동 전체 재번역 완료: 총 {}건", total);
            return total;
        } finally {
            translateLock.unlock();
        }
    }

    /**
     * 아직 번역 안 된 팀(나라) 이름을 한국어로 일괄 번역해 nameKo에 채운다(번역 전=name / 번역 후=nameKo 둘 다 보관).
     * Gemini 호출(네트워크 I/O)은 트랜잭션 밖에서 한 번에 묶어 수행하고, 저장만 self.applyTeamTranslation으로
     * 짧은 독립 트랜잭션에서 커밋한다(HTTP-in-transaction 방지). 번역 대상이 없으면 Gemini를 호출하지 않는다(멱등).
     * 한 번 호출당 최대 TRANSLATE_BATCH_MAX팀만 처리하고 실제로 저장된 건수를 반환한다.
     */
    private int enrichTeamTranslations() {
        // 동시 번역 방지(P5) — 다른 경로(스케줄 동기화 ↔ 관리자 수동)가 번역 중이면 스킵.
        // ReentrantLock이라 translateMissingTeamNames가 이미 잡은 경우(같은 스레드)엔 재진입 허용.
        if (!translateLock.tryLock()) return 0;
        try {
            return doEnrichTeamTranslations();
        } finally {
            translateLock.unlock();
        }
    }

    private int doEnrichTeamTranslations() {
        java.util.List<Team> targets = teamRepository.findUntranslated();
        if (targets.isEmpty()) return 0;
        if (targets.size() > TRANSLATE_BATCH_MAX) {
            targets = targets.subList(0, TRANSLATE_BATCH_MAX);
        }
        java.util.List<String> names = targets.stream()
                .map(Team::getName)
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .toList();
        if (names.isEmpty()) return 0;

        java.util.Map<String, String> ko = translationService.translateTeamNames(names);
        if (ko.isEmpty()) return 0;

        int saved = 0;
        for (Team t : targets) {
            String k = ko.get(TranslationService.normalizeKey(t.getName()));   // 정규화 키로 매칭(P3)
            if (k != null && !k.isBlank()) {
                self.applyTeamTranslation(t.getId(), k);
                saved++;
            }
        }
        log.info("[fotmob-schedule] 팀명 한국어 번역 {}건 저장", saved);
        return saved;
    }

    /** 팀 한국어 이름만 짧게 반영(단독 트랜잭션). */
    @Transactional
    public void applyTeamTranslation(Long teamId, String nameKo) {
        teamRepository.findById(teamId).ifPresent(t -> t.updateKoName(nameKo));
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
        enrichTeamTranslations();      // 새로 들어온 팀(나라) 이름을 한국어로 번역(번역 전=name / 번역 후=nameKo)
        log.info("[fotmob-schedule] 리그 {} 전체 일정 {}경기 동기화", leagueId, count);
        return count;
    }

    // ── 토너먼트 예상 브래킷(playoff) 동기화 ──────────────────────────────
    // FotMob는 그룹 진행에 따라 32강 등 **예상 대진**을 채워준다. 이를 받아 기존(일정 동기화로 만들어진)
    // 토너먼트 경기에 stage(라운드명)·bracketOrder(슬롯 순서)·예상 팀(32강 한정)을 반영한다.
    // 일정 동기화(syncFullLeague)가 stage=null로 덮으므로 **반드시 그 뒤에** 돌려야 한다.

    /** "1/16"·"1/8"·"1/4"·"1/2"·"final" → 프론트 라운드 키. 알 수 없으면 null(스킵). */
    private String mapPlayoffStage(String fotmobStage) {
        if (fotmobStage == null) return null;
        return switch (fotmobStage.trim().toLowerCase()) {
            case "1/16" -> "Round of 32";
            case "1/8"  -> "Round of 16";
            case "1/4"  -> "Quarter-final";
            case "1/2"  -> "Semi-final";
            case "final" -> "Final";
            default -> null;
        };
    }

    /** playoff-leagues(없으면 full-season-leagues) 전체의 예상 브래킷 동기화. */
    public int syncPlayoffLeagues() {
        String csv = (playoffLeaguesCsv != null && !playoffLeaguesCsv.isBlank())
                ? playoffLeaguesCsv : fullSeasonLeaguesCsv;
        int total = 0;
        for (Long leagueId : parseLeagueIds(csv)) {
            try {
                total += syncPlayoff(leagueId);
            } catch (Exception e) {
                log.warn("[fotmob-playoff] 리그 {} 브래킷 동기화 실패: {}", leagueId, e.getMessage());
            }
        }
        return total;
    }

    /** 단일 리그 예상 브래킷 동기화 — 크롤은 트랜잭션 밖, 저장만 self.persistPlayoff. */
    public int syncPlayoff(Long leagueId) {
        FotmobPlayoffResponse resp = fotmobClient.getPlayoff(leagueId);
        if (resp == null || resp.matchups() == null || resp.matchups().isEmpty()) {
            return 0;
        }
        int count = self.persistPlayoff(resp);
        log.info("[fotmob-playoff] 리그 {} 예상 브래킷 {}대진 반영", leagueId, count);
        return count;
    }

    /**
     * 예상 브래킷을 기존 토너먼트 경기에 반영(트랜잭션). matchId로 기존 경기를 찾아
     * stage·bracketOrder를 설정하고, 미정 아닌(예상 확정) 대진은 팀/시각/스코어/상태까지 갱신한다.
     * 미정(tbd) 대진은 단계만 채워 슬롯이 시간과 함께 표시되게 한다.
     */
    @Transactional
    public int persistPlayoff(FotmobPlayoffResponse resp) {
        int count = 0;
        for (PlayoffMatch pm : resp.matchups()) {
            if (pm.matchId() == null) continue;
            String stage = mapPlayoffStage(pm.stage());
            if (stage == null) continue;

            Match m = matchRepository.findByFotmobMatchId(pm.matchId()).orElse(null);
            if (m == null) continue;   // 일정 동기화가 먼저 만들어 둠 — 없으면 스킵

            try {
                m.applyBracket(stage, pm.drawOrder());

                LocalDateTime kickoff = toKst(pm.utcTime());
                String status = resolvePlayoffStatus(pm);
                if (kickoff != null) {
                    m.updateSchedule(kickoff, stage, m.getGroupName(), status);
                }

                // 예상 확정(미정 아님)인 쪽만 실제 팀으로 반영 — placeholder는 그대로 둔다
                Team home = (!pm.tbd1() && pm.homeId() != null)
                        ? upsertTeam(pm.homeId(), pm.homeName(), pm.homeCrest()) : null;
                Team away = (!pm.tbd2() && pm.awayId() != null)
                        ? upsertTeam(pm.awayId(), pm.awayName(), pm.awayCrest()) : null;
                m.updateTeams(home, away);

                boolean played = !"SCHEDULED".equals(status);
                Integer hs = played ? pm.homeScore() : null;
                Integer as = played ? pm.awayScore() : null;
                m.updateScore(status, hs, as, resolvePlayoffWinner(played, hs, as));

                count++;
            } catch (Exception e) {
                log.warn("[fotmob-playoff] 대진 반영 실패 fotmobId={} : {}", pm.matchId(), e.getMessage());
            }
        }
        return count;
    }

    private String resolvePlayoffStatus(PlayoffMatch pm) {
        if (pm.cancelled()) return "CANCELLED";
        if (pm.finished()) return "FINISHED";
        if (pm.started()) return "IN_PLAY";
        return "SCHEDULED";
    }

    private String resolvePlayoffWinner(boolean played, Integer hs, Integer as) {
        if (!played || hs == null || as == null) return null;
        if (hs > as) return "HOME_TEAM";
        if (as > hs) return "AWAY_TEAM";
        return "DRAW";
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
            existing.updateTeams(home, away);   // 토너먼트 대진 확정(미정→실제 팀) 반영
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
