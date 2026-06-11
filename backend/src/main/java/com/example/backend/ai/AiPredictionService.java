package com.example.backend.ai;

import com.example.backend.fotmob.FotmobStandingService;
import com.example.backend.fotmob.league.LeagueStanding;
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
import java.util.List;
import java.util.Map;
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

    private final MatchRepository matchRepository;
    private final FotmobStandingService standingService;
    private final FifaRankingService fifaRanking;
    private final GeminiClient geminiClient;

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
        int[] pct = parseAndNormalize(json);
        match.applyPrediction(pct[0], pct[1], pct[2]);
        matchRepository.save(match);

        log.info("[ai-predict] matchId={} {} {}%/{}%/{}%", matchId,
                teamName(match.getHomeTeam()) + " vs " + teamName(match.getAwayTeam()),
                pct[0], pct[1], pct[2]);
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
                당신은 축구 경기 결과를 예측하는 분석가입니다. 아래 정보를 바탕으로 결과 확률을 추정하세요.
                홈팀 승(homeWin), 무승부(draw), 원정팀 승(awayWin)을 정수 퍼센트로 주고 세 값의 합은 반드시 100이어야 합니다.

                가중치 우선순위:
                1) 최근 폼·최근 전적과 순위표를 가장 크게 반영하세요(주요 근거).
                2) FIFA랭킹은 보조 참고 지표로만 약하게 반영하세요(숫자 작을수록 강팀).
                최근 폼/전적이 FIFA랭킹과 상충하면 최근 폼/전적을 더 신뢰하고, FIFA랭킹 차이만으로 한쪽을 과도하게 몰지 마세요.
                홈 어드밴티지도 고려하고, 과도한 확신 없이 합리적으로 배분하세요.
                확률은 5나 10 단위로 반올림하지 말고 1퍼센트 단위로 세밀하게 추정하세요(예: 47, 28, 25). 끝자리가 0이나 5에 치우치지 않게 하세요.
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
                        "awayWin", Map.of("type", "INTEGER")),
                "required", List.of("homeWin", "draw", "awayWin"));
        return Map.of(
                "temperature", 0.4,
                "responseMimeType", "application/json",
                "responseSchema", schema,
                "thinkingConfig", Map.of("thinkingBudget", 0));
    }

    /** JSON 파싱 후 합 100으로 정규화(반올림 오차는 홈 확률에 흡수). */
    private int[] parseAndNormalize(String json) {
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
            return new int[]{hh, dd, aa};
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new BadRequestException("AI 예측 응답 파싱 실패: " + e.getMessage());
        }
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
