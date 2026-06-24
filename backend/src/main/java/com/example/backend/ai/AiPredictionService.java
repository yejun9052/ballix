package com.example.backend.ai;

import com.example.backend.fotmob.FotmobStandingService;
import com.example.backend.fotmob.dto.FotmobPlayerResponse;
import com.example.backend.fotmob.league.LeagueStanding;
import com.example.backend.fotmob.lineup.LineupPlayer;
import com.example.backend.fotmob.lineup.LineupPlayerRepository;
import com.example.backend.fotmob.player.PlayerService;
import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.team.Team;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 관리자가 선택한 경기의 AI 승률 예측.
 * 입력은 DB에 이미 있는 데이터(리그 순위 + 최근 폼)만 압축 다이제스트로 구성해 토큰을 아낀다.
 * 출력은 {homeWin, draw, awayWin} JSON으로 강제하고 합 100으로 정규화해 Match에 저장한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiPredictionService {

    private static final int FORM_COUNT = 5;
    /** 핵심 선수 라인에 노출할 팀당 상위 선수 수(시장가치 순). */
    private static final int KEY_PLAYER_COUNT = 4;

    private final MatchRepository matchRepository;
    private final FotmobStandingService standingService;
    private final FifaRankingService fifaRanking;
    private final GeminiClient geminiClient;
    private final LineupPlayerRepository lineupPlayerRepository;
    private final PlayerService playerService;
    private final com.example.backend.prediction.AiPlayerService aiPlayerService;
    private final AiPredictionSnapshotRepository snapshotRepository;
    private final com.example.backend.fotmob.matchevent.MatchEventRepository matchEventRepository;

    /** 히스토리 단계 간격(분): 0(경기 전) / 15·30·45·60·75·90. */
    private static final int PHASE_STEP = 15;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 경기 선택 + 즉시 승률 예측. 이미 예측됐으면 force=false 시 그대로 반환(멱등, 토큰 0). */
    @Transactional
    public Match predict(Long matchId, boolean force) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다."));

        String status = match.getStatus();
        if ("FINISHED".equals(status) || "CANCELLED".equals(status)) {
            throw new BadRequestException("종료/취소된 경기는 승률 예측 대상이 아닙니다(킥오프 전 경기를 선택하세요).");
        }
        if (match.hasPrediction() && !force) {
            return match;
        }

        String digest = buildDigest(match);
        String json = geminiClient.generate(buildPrompt(digest), predictionConfig());
        Parsed p = parseAndNormalize(json);
        match.applyPrediction(p.homePct, p.drawPct, p.awayPct, p.homeScore, p.awayScore);
        matchRepository.save(match);

        // 단계별 히스토리 스냅샷 기록(경기 전 0 / 라이브 15·30·45·60·75·90, 단계당 1회) + 변동 사유 보존.
        recordSnapshot(match, p);

        // AI 유저가 이 승률에서 최고 결과를 찍은 것으로 리더보드 참가(킥오프 전 1회 고정, 멱등).
        aiPlayerService.participate(matchId);

        log.info("[ai-predict] matchId={} {} {}%/{}%/{}% 예상스코어 {}:{}", matchId,
                teamName(match.getHomeTeam()) + " vs " + teamName(match.getAwayTeam()),
                p.homePct, p.drawPct, p.awayPct, p.homeScore, p.awayScore);
        return match;
    }

    // ── 다이제스트 ──────────────────────────────────────────────────────
    private String buildDigest(Match m) {
        String home = teamName(m.getHomeTeam());
        String away = teamName(m.getAwayTeam());
        StringBuilder sb = new StringBuilder();
        sb.append("경기: ").append(home).append("(홈) vs ").append(away).append("(원정)\n");
        if (m.getCompetition() != null) {
            sb.append("대회: ").append(m.getCompetition().getName());
            if (m.getGroupName() != null) sb.append(" ").append(m.getGroupName());
            sb.append("\n");
        }
        Integer hr = fifaRanking.rankOf(home);
        Integer ar = fifaRanking.rankOf(away);
        if (hr != null || ar != null) {
            sb.append("FIFA랭킹(숫자 작을수록 강팀): ").append(home).append(" ").append(hr == null ? "?" : hr + "위")
                    .append(" / ").append(away).append(" ").append(ar == null ? "?" : ar + "위").append("\n");
        }
        appendStanding(sb, m, m.getHomeTeam(), "홈");
        appendStanding(sb, m, m.getAwayTeam(), "원정");
        sb.append("최근폼 ").append(home).append(": ").append(formLine(m.getHomeTeam(), m.getMatchTime())).append("\n");
        sb.append("최근폼 ").append(away).append(": ").append(formLine(m.getAwayTeam(), m.getMatchTime())).append("\n");
        // 선발 라인업이 발표돼 있으면(킥오프 ~60분 전부터) 선발 22명의 상세(시장가치·시즌폼)를 반영.
        // 없으면(대부분의 예측 시점) 이 블록을 건너뛰고 위 순위/폼/FIFA만으로 예측(폴백).
        appendLineupAnalysis(sb, m, home, away);
        // 진행 중이면 라이브 상태(현재 스코어·경과시간) 주입 → 남은 결과 확률을 실시간으로 갱신
        if ("IN_PLAY".equals(m.getStatus())) {
            sb.append("[라이브] 현재 스코어 ").append(home).append(" ").append(nz(m.getHomeScore()))
                    .append(" - ").append(nz(m.getAwayScore())).append(" ").append(away);
            if (m.getLiveTime() != null) sb.append(" (경과 ").append(m.getLiveTime()).append(")");
            sb.append("\n");
            // 직전 AI 승률(변동 사유·변동폭 산출 기준)
            if (m.getAiHomePct() != null) {
                sb.append("직전 AI 승률: ").append(home).append(" ").append(m.getAiHomePct())
                        .append("% / 무 ").append(m.getAiDrawPct()).append("% / ").append(away).append(" ").append(m.getAiAwayPct()).append("%\n");
            }
            // 지금까지의 주요 이벤트(골·카드) — 변동 사유 근거
            String events = recentKeyEvents(m);
            if (!events.isBlank()) sb.append("주요 이벤트: ").append(events).append("\n");
            sb.append("진행 중인 경기다. 현재 스코어와 남은 시간을 가장 크게 반영해 '최종 결과' 확률을 다시 추정하라");
            sb.append("(이미 리드 중이면 그 팀 승 확률을 높이고, 남은 시간이 적을수록 현재 스코어를 더 확정적으로 반영).\n");
            sb.append("그리고 reason 필드에 직전 AI 승률 대비 이번 변동의 핵심 이유를 한국어 한 문장으로 적어라");
            sb.append(" — 골·퇴장 등 주요 이벤트와 남은 시간을 근거로, 변동폭(예: '약 12퍼센트포인트 하락')을 포함. 변동이 미미하면 그 취지로 적어라.\n");
        }
        return sb.toString();
    }

    private void appendStanding(StringBuilder sb, Match m, Team team, String label) {
        if (team == null || m.getCompetition() == null || team.getFotmobTeamId() == null) {
            return;
        }
        List<LeagueStanding> rows = standingService.getStandings(m.getCompetition().getId());
        rows.stream()
                .filter(r -> team.getFotmobTeamId().equals(r.getFotmobTeamId()))
                .findFirst()
                .ifPresent(r -> sb.append("순위(").append(label).append(") ").append(r.getTeamName()).append(": ")
                        .append(safe(r.getRankNo())).append("위, ")
                        .append(safe(r.getPlayed())).append("경기 ")
                        .append(safe(r.getWins())).append("승")
                        .append(safe(r.getDraws())).append("무")
                        .append(safe(r.getLosses())).append("패, 승점")
                        .append(safe(r.getPoints())).append(", 득실")
                        .append(safe(r.getGoalDiff())).append("\n"));
    }

    // ── 선발 라인업 분석(시장가치·시즌폼) ───────────────────────────────
    /**
     * 발표된 선발 명단 기반으로 팀 가치 합계·평균 연령·선발 평균 시즌폼·핵심 선수 라인을 다이제스트에 추가.
     * 선발 22명의 상세(시장가치·스탯)는 PlayerService DB-first lazy-cache로 채운다(없으면 1회 크롤,
     * TTL 내 재예측·라이브 재예측은 캐시 재사용이라 추가 크롤 없음). 한쪽이라도 선발이 비면 건너뛴다.
     */
    private void appendLineupAnalysis(StringBuilder sb, Match m, String home, String away) {
        List<LineupPlayer> all = lineupPlayerRepository.findByMatchId(m.getId());
        if (all.isEmpty()) return;
        List<LineupPlayer> homeStarters = all.stream().filter(p -> p.isHome() && p.isStarter()).toList();
        List<LineupPlayer> awayStarters = all.stream().filter(p -> !p.isHome() && p.isStarter()).toList();
        if (homeStarters.isEmpty() || awayStarters.isEmpty()) return;

        sb.append("[선발 라인업 분석] (실제 발표된 선발 명단 기반 — 가장 신뢰도 높은 근거)\n");
        appendSquad(sb, home, homeStarters);
        appendSquad(sb, away, awayStarters);
    }

    /** 한 팀 선발의 가치 합계·평균연령·평균 시즌평점/득점 + 가치 상위 핵심 선수 라인. */
    private void appendSquad(StringBuilder sb, String teamLabel, List<LineupPlayer> starters) {
        List<PlayerAgg> aggs = new ArrayList<>();
        double valueSum = 0;
        double ageSum = 0;
        int ageCount = 0;
        double ratingSum = 0;
        int ratingCount = 0;
        double goalSum = 0;
        int goalCount = 0;

        for (LineupPlayer lp : starters) {
            Long pid = lp.getFotmobPlayerId();
            if (pid == null) continue;
            FotmobPlayerResponse r = playerService.getOrFetch(pid);   // DB-first lazy(캐시 신선하면 크롤 안 함)
            if (r == null) continue;

            Double value = parseMoneyMillions(infoValue(r, "시장가치", "market value", "market", "value"));
            Double age = parseNum(infoValue(r, "나이", "age"));
            Double rating = parseNum(statValue(r, "평점", "rating"));
            Double goals = parseNum(statValue(r, "골", "goal"));
            Double assists = parseNum(statValue(r, "도움", "assist"));

            if (value != null) valueSum += value;
            if (age != null) { ageSum += age; ageCount++; }
            if (rating != null) { ratingSum += rating; ratingCount++; }
            if (goals != null) { goalSum += goals; goalCount++; }

            aggs.add(new PlayerAgg(displayName(r, lp), value, rating, goals, assists));
        }
        if (aggs.isEmpty()) return;

        sb.append("· ").append(teamLabel).append(" 선발: 팀가치 합계 ").append(formatMillions(valueSum));
        if (ageCount > 0) sb.append(", 평균연령 ").append(round1(ageSum / ageCount));
        if (ratingCount > 0) sb.append(", 선발 평균 시즌평점 ").append(round1(ratingSum / ratingCount));
        if (goalCount > 0) sb.append(", 선발 평균 시즌득점 ").append(round1(goalSum / goalCount));
        sb.append("\n");

        // 핵심 선수: 시장가치 상위 N명(가치 없으면 뒤로)
        aggs.sort(Comparator.comparingDouble((PlayerAgg a) -> a.value == null ? -1 : a.value).reversed());
        sb.append("  핵심선수(").append(teamLabel).append("): ");
        sb.append(aggs.stream().limit(KEY_PLAYER_COUNT).map(this::keyPlayerLine)
                .collect(Collectors.joining(", ")));
        sb.append("\n");
    }

    private String keyPlayerLine(PlayerAgg a) {
        StringBuilder b = new StringBuilder(a.name);
        List<String> parts = new ArrayList<>();
        if (a.value != null) parts.add(formatMillions(a.value));
        if (a.goals != null) parts.add("시즌 " + intStr(a.goals) + "골" + (a.assists != null ? " " + intStr(a.assists) + "도움" : ""));
        if (a.rating != null) parts.add("평점 " + round1(a.rating));
        if (!parts.isEmpty()) b.append("(").append(String.join(", ", parts)).append(")");
        return b.toString();
    }

    private record PlayerAgg(String name, Double value, Double rating, Double goals, Double assists) {}

    private String displayName(FotmobPlayerResponse r, LineupPlayer lp) {
        if (r.name() != null && !r.name().isBlank()) return r.name();
        return lp.getName() != null ? lp.getName() : "선수";
    }

    /** info 항목에서 label이 keys 중 하나를 포함(부분·대소문자 무시)하는 첫 값. */
    private String infoValue(FotmobPlayerResponse r, String... keys) {
        if (r.info() == null) return null;
        for (FotmobPlayerResponse.Info it : r.info()) {
            if (it.label() == null || it.value() == null) continue;
            String label = it.label().toLowerCase();
            for (String k : keys) if (label.contains(k.toLowerCase())) return it.value();
        }
        return null;
    }

    /** stats 항목에서 title이 keys 중 하나를 포함하는 첫 값. */
    private Object statValue(FotmobPlayerResponse r, String... keys) {
        if (r.stats() == null) return null;
        for (FotmobPlayerResponse.Stat st : r.stats()) {
            if (st.title() == null || st.value() == null) continue;
            String title = st.title().toLowerCase();
            for (String k : keys) if (title.contains(k.toLowerCase())) return st.value();
        }
        return null;
    }

    private static final Pattern NUM = Pattern.compile("-?[0-9]+(?:\\.[0-9]+)?");

    /** 임의 값에서 첫 숫자를 추출(스탯은 "12", "7.4", "12 골" 등 혼재). */
    private Double parseNum(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        Matcher mt = NUM.matcher(o.toString());
        return mt.find() ? Double.parseDouble(mt.group()) : null;
    }

    /** "€50.0M"/"$900K"/"50000000" 같은 시장가치를 백만(€M) 단위 숫자로 변환. */
    private Double parseMoneyMillions(String raw) {
        if (raw == null) return null;
        String s = raw.trim().toUpperCase().replace(",", "");
        Matcher mt = Pattern.compile("([0-9]+(?:\\.[0-9]+)?)\\s*([KMB]?)").matcher(s);
        if (!mt.find()) return null;
        double v = Double.parseDouble(mt.group(1));
        switch (mt.group(2)) {
            case "B" -> v *= 1000;       // 십억 → 백만
            case "K" -> v /= 1000;       // 천 → 백만
            case "M" -> { /* 이미 백만 */ }
            default -> { if (v > 10000) v /= 1_000_000; }  // 접미사 없는 원시 통화값
        }
        return v;
    }

    /** 백만(€M) 단위 합계를 €450M / €1.2B로 표기. */
    private String formatMillions(double m) {
        if (m <= 0) return "정보없음";
        if (m >= 1000) return "€" + round1(m / 1000) + "B";
        return "€" + Math.round(m) + "M";
    }

    private String round1(double v) {
        return String.valueOf(Math.round(v * 10) / 10.0);
    }

    private String intStr(double v) {
        return String.valueOf((long) v);
    }

    private String formLine(Team team, LocalDateTime before) {
        if (team == null) return "정보 없음";
        List<Match> recent = matchRepository.findRecentForm(team.getId(), before, PageRequest.of(0, FORM_COUNT));
        if (recent.isEmpty()) return "최근 경기 없음";
        return recent.stream().map(r -> resultToken(r, team.getId())).collect(Collectors.joining(", "));
    }

    private String resultToken(Match r, Long teamId) {
        boolean homeSide = r.getHomeTeam() != null && teamId.equals(r.getHomeTeam().getId());
        Integer gf = homeSide ? r.getHomeScore() : r.getAwayScore();
        Integer ga = homeSide ? r.getAwayScore() : r.getHomeScore();
        String wdl = (gf == null || ga == null) ? "?" : (gf > ga ? "승" : (gf < ga ? "패" : "무"));
        String opp = teamName(homeSide ? r.getAwayTeam() : r.getHomeTeam());
        return wdl + " " + nz(gf) + "-" + nz(ga) + "(" + opp + ")";
    }

    // ── 프롬프트 / 출력 스키마 ──────────────────────────────────────────
    private String buildPrompt(String digest) {
        return """
                당신은 축구 경기 결과를 예측하는 분석가입니다. 아래 정보를 바탕으로 결과 확률과 예상 스코어를 추정하세요.
                홈팀 승(homeWin), 무승부(draw), 원정팀 승(awayWin)을 정수 퍼센트로 주고 세 값의 합은 반드시 100이어야 합니다.
                추가로 가장 가능성 높은 최종 스코어를 홈팀 득점(homeScore)·원정팀 득점(awayScore) 정수로 주세요.

                가중치 우선순위:
                1) [선발 라인업 분석]이 주어지면(실제 발표된 선발 명단·팀 가치 합계·핵심 선수·선발 평균 시즌폼·평균 연령) 이를 가장 중요한 근거로 삼으세요. 양 팀 팀가치 차이가 크면 가치 높은 팀에 유리하게, 핵심 선수의 시즌 득점·평점이 높으면 그 팀 공격력을 더 인정하세요. (라인업 분석이 없으면 이 항목은 무시)
                2) 최근 폼·최근 전적과 순위표를 크게 반영하세요(주요 근거).
                3) FIFA랭킹은 보조 참고 지표로만 약하게 반영하세요(숫자 작을수록 강팀).
                최근 폼/전적이 FIFA랭킹과 상충하면 최근 폼/전적을 더 신뢰하고, FIFA랭킹 차이만으로 한쪽을 과도하게 몰지 마세요.
                홈 어드밴티지도 고려하고, 과도한 확신 없이 합리적으로 배분하세요.
                확률은 5나 10 단위로 반올림하지 말고 1퍼센트 단위로 세밀하게 추정하세요(예: 47, 28, 25). 끝자리가 0이나 5에 치우치지 않게 하세요.

                예상 스코어 규칙:
                - 실제 축구에서 흔히 나오는 현실적인 점수로만 예측하세요(보통 한 팀당 0~4골, 합계 0~5골 범위). 과장된 점수(예: 6-0)는 압도적 전력차가 명확할 때만 쓰세요.
                - 예상 스코어의 승패 방향은 위 확률에서 가장 높은 결과와 일치해야 합니다(홈승 확률이 가장 높으면 홈 우세 스코어, 무승부 확률이 가장 높으면 동점, 원정승 확률이 가장 높으면 원정 우세 스코어).
                - 최근 폼의 득실 경향을 반영해 현실적인 골 수를 정하세요.

                변동 사유(reason):
                - [라이브] 정보와 '직전 AI 승률'이 주어지면, reason에 직전 대비 이번 변동의 핵심 이유를 한국어 한 문장으로 적으세요(골·퇴장 등 주요 이벤트·남은 시간 근거, 변동폭 포함). 예: "전반 35분 손흥민 퇴장으로 한국 승률 약 12퍼센트포인트 하락".
                - 경기 전(라이브 정보 없음)이면 reason은 빈 문자열("")로 두세요.
                JSON 외 다른 텍스트는 출력하지 마세요.

                [경기 정보]
                %s""".formatted(digest);
    }

    private Map<String, Object> predictionConfig() {
        Map<String, Object> schema = Map.of(
                "type", "OBJECT",
                "properties", Map.of(
                        "homeWin", Map.of("type", "INTEGER"),
                        "draw", Map.of("type", "INTEGER"),
                        "awayWin", Map.of("type", "INTEGER"),
                        "homeScore", Map.of("type", "INTEGER"),
                        "awayScore", Map.of("type", "INTEGER"),
                        "reason", Map.of("type", "STRING")),
                "required", List.of("homeWin", "draw", "awayWin", "homeScore", "awayScore"));
        return Map.of(
                "temperature", 0.4,
                "responseMimeType", "application/json",
                "responseSchema", schema,
                "thinkingConfig", Map.of("thinkingBudget", 0));
    }

    /** 파싱 결과: 정규화된 승률(합 100) + 예상 스코어 + 변동 사유(reason, 라이브만 채워짐). */
    private record Parsed(int homePct, int drawPct, int awayPct, int homeScore, int awayScore, String reason) {}

    /** JSON 파싱 후 합 100으로 정규화(반올림 오차는 홈 확률에 흡수). 예상 스코어는 0~9로 클램프. */
    private Parsed parseAndNormalize(String json) {
        try {
            JsonNode n = objectMapper.readTree(json);
            int h = n.path("homeWin").asInt(0);
            int d = n.path("draw").asInt(0);
            int a = n.path("awayWin").asInt(0);
            int sum = h + d + a;
            if (sum <= 0) {
                throw new BadRequestException("AI 예측 값이 유효하지 않습니다: " + json);
            }
            int dd = Math.round(d * 100f / sum);
            int aa = Math.round(a * 100f / sum);
            int hh = Math.max(0, 100 - dd - aa);  // 반올림 오버플로우 음수 방지

            int hs = clampScore(n.path("homeScore").asInt(0));
            int as = clampScore(n.path("awayScore").asInt(0));
            // 예상 스코어 방향이 최고 확률 결과와 어긋나면 동점으로 보정(모순 표시 방지).
            boolean homeTop = hh >= dd && hh >= aa;
            boolean awayTop = aa > hh && aa >= dd;
            if (homeTop && hs <= as) hs = as + 1;
            else if (awayTop && as <= hs) as = hs + 1;
            else if (!homeTop && !awayTop && hs != as) {  // 무승부가 최고 확률인데 스코어가 갈리면 동점화
                int lvl = Math.min(hs, as);
                hs = lvl;
                as = lvl;
            }
            String reason = n.path("reason").asText("");
            return new Parsed(hh, dd, aa, clampScore(hs), clampScore(as), reason);
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("AI 예측 응답 파싱 실패: " + e.getMessage());
        }
    }

    private int clampScore(int v) {
        return Math.max(0, Math.min(9, v));
    }

    // ── 히스토리 스냅샷 ──────────────────────────────────────────────────
    /** 현재 경과 분 기준 단계: 경기 전/시계 정지=0, 진행 중이면 15분 단위(0·15·30·45·60·75·90…). */
    private int currentPhase(Match m) {
        if (!"IN_PLAY".equals(m.getStatus())) return 0;
        Long anchorMs = m.getLiveStartedAtMs();
        if (anchorMs == null) return 0;   // HT 등 시계 정지 → 기준 모호, 0 취급
        long elapsedMin = (System.currentTimeMillis() - anchorMs) / 60000L;
        if (elapsedMin < 0) return 0;
        return (int) (elapsedMin / PHASE_STEP) * PHASE_STEP;
    }

    /** 단계별 스냅샷 1행 기록. 경기 전(0)은 (재)생성 시 히스토리 초기화 후 기준점 저장, 라이브는 단계당 1회. */
    private void recordSnapshot(Match m, Parsed p) {
        int phase = currentPhase(m);
        String reason = (p.reason == null || p.reason.isBlank())
                ? (phase == 0 ? "경기 전 초기 예측" : "특이 변동 없음")
                : p.reason.trim();
        if (phase == 0) {
            snapshotRepository.deleteByMatchId(m.getId());   // 경기 전 재생성 시 히스토리 리셋
        } else if (snapshotRepository.existsByMatchIdAndPhaseMinute(m.getId(), phase)) {
            return;   // 같은 단계 이미 기록됨 → 중복 방지
        }
        boolean live = "IN_PLAY".equals(m.getStatus());
        snapshotRepository.save(AiPredictionSnapshot.builder()
                .matchId(m.getId())
                .phaseMinute(phase)
                .homePct(m.getAiHomePct()).drawPct(m.getAiDrawPct()).awayPct(m.getAiAwayPct())
                .homeScore(live ? m.getHomeScore() : null)
                .awayScore(live ? m.getAwayScore() : null)
                .reason(reason)
                .build());
    }

    /** 지금까지의 주요 이벤트(골·카드)를 "35' 한국 손흥민 퇴장(레드)" 식으로 나열 — 변동 사유 근거. */
    private String recentKeyEvents(Match m) {
        return matchEventRepository.findByMatchIdOrderByMinuteAsc(m.getId()).stream()
                .filter(e -> "GOAL".equals(e.getType()) || "CARD".equals(e.getType()))
                .map(e -> {
                    String who = e.isHome() ? teamName(m.getHomeTeam()) : teamName(m.getAwayTeam());
                    String min = e.getMinute() == null ? "?" : e.getMinute() + "'";
                    String name = e.getPlayerName() == null ? "" : e.getPlayerName() + " ";
                    String what = "GOAL".equals(e.getType()) ? "골"
                            : (e.getDetail() != null && e.getDetail().toLowerCase().contains("red")) ? "퇴장(레드)" : "경고(옐로)";
                    return min + " " + who + " " + name + what;
                })
                .collect(Collectors.joining(", "));
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────
    private String teamName(Team t) {
        return t == null ? "미정" : t.getName();
    }

    private String safe(Integer v) {
        return v == null ? "-" : v.toString();
    }

    private String nz(Integer v) {
        return v == null ? "-" : v.toString();
    }
}
