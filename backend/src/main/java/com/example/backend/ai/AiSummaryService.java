package com.example.backend.ai;

import com.example.backend.fotmob.FotmobClient;
import com.example.backend.fotmob.dto.FotmobCommentaryResponse;
import com.example.backend.fotmob.dto.FotmobCommentaryResponse.GoalComment;
import com.example.backend.fotmob.matchevent.MatchEvent;
import com.example.backend.fotmob.matchevent.MatchEventRepository;
import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.match.Match;
import com.example.backend.match.MatchRepository;
import com.example.backend.team.Team;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 종료된 경기의 골 내용 AI 요약.
 * 골/퇴장 이벤트(MatchEvent)는 폴링 때 이미 DB에 수집돼 있어 추가 크롤이 필요 없다.
 * 조회 시 요약이 없으면 그 자리에서 1회 생성·저장 후 반환(DB-first lazy), 이후엔 DB만 읽는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiSummaryService {

    private final MatchRepository matchRepository;
    private final MatchEventRepository eventRepository;
    private final FotmobClient fotmobClient;
    private final GeminiClient geminiClient;

    // Gemini 생성 실패 시 N분 동안 재시도 억제 — ltc 크롤 + 4회 재시도 반복 방지
    private static final long SUMMARY_FAIL_COOLDOWN_MINUTES = 5;
    private final Map<Long, LocalDateTime> failedAt = new ConcurrentHashMap<>();

    /** 종료 경기의 골 요약 조회 — DB-first lazy(있으면 가져오고, 없으면 1회 생성·저장 후 반환).
     *  1순위: FotMob 라이브티커 골 해설(영문) → Gemini가 해설 말투로 번역·요약.
     *  폴백: 라이브티커가 없으면 저장된 MatchEvent(득점자/어시스트)로 요약.
     *  (공개 엔드포인트라 외부 강제 재생성은 막는다 — 한 번 생성되면 캐시만 반환.) */
    @Transactional
    public Match getOrGenerate(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다."));

        // 이미 요약이 있으면 DB 값 그대로 반환(Gemini 재호출 없음)
        if (match.hasSummary()) {
            return match;
        }
        if (!match.isFotmobFinalized() && !"FINISHED".equals(match.getStatus())) {
            throw new BadRequestException("아직 종료되지 않은 경기는 요약할 수 없습니다.");
        }

        // 최근 생성 실패 경기면 쿨다운 동안 재시도 억제
        LocalDateTime failed = failedAt.get(matchId);
        if (failed != null && ChronoUnit.MINUTES.between(failed, LocalDateTime.now()) < SUMMARY_FAIL_COOLDOWN_MINUTES) {
            return match;
        }

        String prompt = null;

        // 1순위: 라이브티커 골 해설
        if (match.getFotmobMatchId() != null) {
            try {
                FotmobCommentaryResponse c = fotmobClient.getCommentary(match.getFotmobMatchId());
                if (c != null && c.goals() != null && !c.goals().isEmpty()) {
                    prompt = buildCommentaryPrompt(buildCommentaryDigest(match, c.goals()));
                }
            } catch (Exception e) {
                log.warn("[ai-summary] 라이브티커 수집 실패 matchId={} : {} → 이벤트 폴백", matchId, e.getMessage());
            }
        }

        // 폴백: 저장된 이벤트
        if (prompt == null) {
            List<MatchEvent> events = eventRepository.findByMatchIdOrderByMinuteAsc(match.getId());
            prompt = buildPrompt(buildDigest(match, events));
        }

        try {
            String summary = geminiClient.generate(prompt, summaryConfig());
            failedAt.remove(matchId);
            match.applySummary(summary);
            matchRepository.save(match);
            log.info("[ai-summary] matchId={} 요약 생성 ({}자, {})",
                    matchId, summary.length(), prompt.contains("해설") ? "라이브티커" : "이벤트폴백");
        } catch (Exception e) {
            failedAt.put(matchId, LocalDateTime.now());
            throw e;
        }
        return match;
    }

    // ── 라이브티커 골 해설 기반 ──────────────────────────────────────────
    private String buildCommentaryDigest(Match m, List<GoalComment> goals) {
        String home = teamName(m.getHomeTeam());
        String away = teamName(m.getAwayTeam());
        StringBuilder sb = new StringBuilder();
        sb.append(home).append(" ").append(nz(m.getHomeScore()))
                .append("-").append(nz(m.getAwayScore())).append(" ").append(away).append("\n");
        sb.append("골 장면 해설(영문):\n");
        for (GoalComment g : goals) {
            String min = (g.minute() == null ? "?" : g.minute())
                    + (g.addedTime() != null ? "+" + g.addedTime() : "") + "'";
            sb.append("- ").append(min).append(" ").append(g.text()).append("\n");
        }
        return sb.toString();
    }

    private String buildCommentaryPrompt(String digest) {
        return """
                아래는 끝난 축구 경기의 골 장면에 대한 영어 해설입니다.
                이걸 한국어로 옮기되, 실제 축구 중계 캐스터처럼 생생하고 직관적인 해설 말투로 2~4문장으로 요약하세요.
                골 넣은 선수와 시간, 슛 방식(왼발/오른발/헤더 등)과 위치, 어시스트를 자연스럽게 살리고 최종 스코어로 마무리하세요.
                머리말이나 마크다운 없이 본문만 출력하세요.
                %s""".formatted(digest);
    }

    // ── 다이제스트 ──────────────────────────────────────────────────────
    private String buildDigest(Match m, List<MatchEvent> events) {
        String home = teamName(m.getHomeTeam());
        String away = teamName(m.getAwayTeam());
        StringBuilder sb = new StringBuilder();
        sb.append(home).append(" ").append(nz(m.getHomeScore()))
                .append("-").append(nz(m.getAwayScore())).append(" ").append(away).append("\n");
        sb.append("골/주요이벤트:\n");

        boolean any = false;
        for (MatchEvent e : events) {
            String side = e.isHome() ? home : away;
            String minute = (e.getMinute() == null ? "?" : e.getMinute().toString())
                    + (e.getAddedTime() != null ? "+" + e.getAddedTime() : "") + "'";
            if ("GOAL".equals(e.getType())) {
                sb.append("- ").append(minute).append(" 골 ").append(side).append(" ").append(nz(e.getPlayerName()));
                if (e.getDetail() != null && !e.getDetail().isBlank()) {
                    sb.append(" (").append(e.getDetail()).append(")");
                }
                sb.append("\n");
                any = true;
            } else if ("CARD".equals(e.getType())
                    && e.getDetail() != null && e.getDetail().toLowerCase().contains("red")) {
                sb.append("- ").append(minute).append(" 퇴장 ").append(side).append(" ").append(nz(e.getPlayerName())).append("\n");
                any = true;
            }
        }
        if (!any) {
            sb.append("- 기록된 골 없음\n");
        }
        return sb.toString();
    }

    private String buildPrompt(String digest) {
        return """
                아래는 끝난 축구 경기의 스코어와 골 기록입니다. 한국어로 2~3문장의 간결한 경기 요약을 작성하세요.
                골을 넣은 선수와 시점을 자연스럽게 엮되 과장 없이 사실 위주로 쓰고, 머리말/마크다운 없이 본문만 출력하세요.

                %s""".formatted(digest);
    }

    private Map<String, Object> summaryConfig() {
        return Map.of(
                "temperature", 0.6,
                "maxOutputTokens", 400,
                "thinkingConfig", Map.of("thinkingBudget", 0));
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────
    private String teamName(Team t) {
        return t == null ? "미정" : t.getName();
    }

    private String nz(Integer v) {
        return v == null ? "-" : v.toString();
    }

    private String nz(String s) {
        return (s == null || s.isBlank()) ? "선수미상" : s;
    }
}
