package com.example.backend.match;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.team.Team;
import com.example.backend.youtube.YoutubeClient;
import com.example.backend.youtube.dto.YoutubeSearchResponse;
import com.example.backend.youtube.dto.YoutubeSearchResponse.Video;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 종료된 경기의 유튜브 하이라이트 영상 자동 조회.
 * 조회 시 등록된 영상(replayYoutubeId)이 없으면 그 자리에서 유튜브를 1회 검색해
 * 가장 적합한 영상을 골라 저장 후 반환(DB-first lazy, AiSummaryService와 같은 패턴).
 * 관리자가 수동 등록한 영상이 있으면 그대로 둔다(자동 검색은 비어있을 때만).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MatchHighlightService {

    private final MatchRepository matchRepository;
    private final YoutubeClient youtubeClient;

    // 검색 실패(또는 후보 없음) 시 N분 동안 재검색 억제 — 매 조회마다 유튜브 크롤 폭주 방지
    private static final long FAIL_COOLDOWN_MINUTES = 30;
    private final Map<Long, LocalDateTime> failedAt = new ConcurrentHashMap<>();

    /** 종료 경기의 하이라이트 조회 — DB-first lazy. 영상이 있으면 그대로, 없으면 1회 검색·저장 후 반환. */
    @Transactional
    public Match getOrFetch(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다."));

        // 이미 영상이 있으면(자동/수동 무관) DB 값 그대로 반환 — 재검색 없음
        if (match.getReplayYoutubeId() != null && !match.getReplayYoutubeId().isBlank()) {
            return match;
        }
        if (!match.isFotmobFinalized() && !"FINISHED".equals(match.getStatus())) {
            throw new BadRequestException("아직 종료되지 않은 경기는 하이라이트를 가져올 수 없습니다.");
        }

        // 최근 실패 경기면 쿨다운 동안 재검색 억제(빈 값 반환)
        LocalDateTime failed = failedAt.get(matchId);
        if (failed != null && ChronoUnit.MINUTES.between(failed, LocalDateTime.now()) < FAIL_COOLDOWN_MINUTES) {
            return match;
        }

        String home = teamName(match.getHomeTeam());
        String away = teamName(match.getAwayTeam());
        if (home == null || away == null) {
            failedAt.put(matchId, LocalDateTime.now());
            return match;
        }

        // 한국 방송사 영상만 띄울 거라 검색도 한국어로 한다 — 영어 쿼리("Korea vs Czechia highlights")는
        // 검색결과가 외국/공식(FIFA) 채널 위주라 한국 방송사 영상이 아예 안 surface된다.
        // 두 팀 모두 한국어 이름(nameKo)이 있으면 "{홈} {원정} 하이라이트"로, 없으면 영어로 폴백.
        String homeKo = teamNameKo(match.getHomeTeam());
        String awayKo = teamNameKo(match.getAwayTeam());
        boolean korean = homeKo != null && awayKo != null;
        String query = korean
                ? homeKo + " " + awayKo + " 하이라이트"
                : home + " vs " + away + " highlights";

        // 제목 적합도 매칭용 토큰(영문 마지막 단어 + 한국어 전체) — 채널 필터를 통과한 후보들의 정렬용
        List<String> tokens = new ArrayList<>();
        tokens.add(lastWord(home).toLowerCase());
        tokens.add(lastWord(away).toLowerCase());
        if (homeKo != null) tokens.add(homeKo.toLowerCase());
        if (awayKo != null) tokens.add(awayKo.toLowerCase());

        try {
            YoutubeSearchResponse res = youtubeClient.search(query);
            String videoId = pickBest(res, tokens);
            if (videoId == null) {
                failedAt.put(matchId, LocalDateTime.now());
                log.info("[highlight] matchId={} 적합한 영상 없음 (q={})", matchId, query);
                return match;
            }
            failedAt.remove(matchId);
            match.applyReplay(videoId);
            matchRepository.save(match);
            log.info("[highlight] matchId={} 하이라이트 자동 등록 videoId={} (q={})", matchId, videoId, query);
        } catch (Exception e) {
            failedAt.put(matchId, LocalDateTime.now());
            log.warn("[highlight] matchId={} 유튜브 검색 실패: {}", matchId, e.getMessage());
        }
        return match;
    }

    /**
     * 허용할 한국 방송사 채널 키워드(채널명 소문자 부분일치) — 이 목록에 걸리는 채널만 후보가 된다.
     * KBS/SBS/MBC 스포츠, JTBC, SPOTV(스포티비), 쿠팡플레이, tvN 등 + 산하 유튜브 브랜드(엠빅/비디오머그/스브스).
     */
    private static final List<String> PREFERRED_CHANNELS = List.of(
            "kbs", "sbs", "mbc", "jtbc", "spotv", "스포티비", "스포타임",
            "쿠팡", "coupang", "tvn", "엠빅", "비디오머그", "스브스");
    /** 임베드 가능 후보를 찾기 위해 확인할 상위 후보 수 상한(불필요한 크롤 방지). */
    private static final int MAX_EMBED_CHECKS = 5;

    /**
     * 한국 방송사 채널 영상 중 하이라이트로 가장 적합하면서 '임베드 재생 가능한' 영상 선택.
     * 채널이 PREFERRED_CHANNELS(KBS/SBS/MBC/JTBC/SPOTV/쿠팡 등)에 걸리는 영상만 후보로 삼고(외국·FIFA·
     * 타종목은 전부 제외), 그 안에서 제목 적합도(하이라이트 키워드·팀명 일치) 높은 순으로 정렬한 뒤
     * 상위 후보부터 실제 임베드 가능한 첫 영상을 고른다.
     * 한국 방송사 후보가 없거나 전부 임베드 불가면 null(엉뚱한 외국 영상 대신 아무것도 안 보여줌 → 잠시 후 재시도).
     */
    private String pickBest(YoutubeSearchResponse res, List<String> tokens) {
        if (res == null || res.videos() == null || res.videos().isEmpty()) {
            return null;
        }
        // 한국 방송사 채널만 후보로 — 그 외(외국/FIFA/개인 채널)는 전부 제외하고, 적합도 높은 순 정렬
        List<Video> korean = res.videos().stream()
                .filter(v -> isPreferredChannel(v.channel() == null ? "" : v.channel().toLowerCase()))
                .filter(v -> relevance(v, tokens) >= 0)   // 타종목(야구/농구 등) 제외
                .sorted(Comparator.comparingInt((Video v) -> relevance(v, tokens)).reversed())
                .toList();

        int checked = 0;
        for (Video v : korean) {
            if (checked >= MAX_EMBED_CHECKS) break;
            checked++;
            if (youtubeClient.isEmbeddable(v.videoId())) {
                log.info("[highlight] 선택 videoId={} ch={} title={}", v.videoId(), v.channel(), v.title());
                return v.videoId();
            }
            log.info("[highlight] 임베드 불가 건너뜀 videoId={} ch={}", v.videoId(), v.channel());
        }
        return null;
    }

    /** 한국 방송사 후보 안에서의 적합도: 하이라이트 키워드 +20, 팀명 일치 +8씩, 타종목 -100. */
    private int relevance(Video v, List<String> tokens) {
        String t = v.title() == null ? "" : v.title().toLowerCase();
        int s = 0;
        if (t.contains("highlight") || t.contains("하이라이트")) s += 20;
        for (String tok : tokens) {
            if (!tok.isBlank() && t.contains(tok)) s += 8;
        }
        if (t.contains("baseball") || t.contains("야구") || t.contains("basketball") || t.contains("농구")) s -= 100;
        return s;
    }

    private boolean isPreferredChannel(String channel) {
        for (String c : PREFERRED_CHANNELS) {
            if (channel.contains(c)) return true;
        }
        return false;
    }

    /** "South Korea" → "korea" 처럼 팀명 마지막 단어(국가명 매칭률↑). */
    private String lastWord(String name) {
        String[] parts = name.trim().split("\\s+");
        return parts.length == 0 ? name : parts[parts.length - 1];
    }

    private String teamName(Team t) {
        return t == null ? null : t.getName();
    }

    /** 한국어 팀명(번역된 nameKo) — 없으면 null. 한국어 검색어 구성에 쓴다. */
    private String teamNameKo(Team t) {
        if (t == null) return null;
        String ko = t.getNameKo();
        return (ko == null || ko.isBlank()) ? null : ko;
    }
}
