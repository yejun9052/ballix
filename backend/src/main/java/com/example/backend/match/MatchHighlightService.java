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

        String query = home + " vs " + away + " highlights";
        try {
            YoutubeSearchResponse res = youtubeClient.search(query);
            String videoId = pickBest(res, home, away);
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

    /** 우선 선택할 한국 방송사/스포츠 채널 키워드(채널명 소문자 부분일치). */
    private static final List<String> PREFERRED_CHANNELS = List.of(
            "kbs", "sbs", "mbc", "jtbc", "spotv", "쿠팡", "coupang", "tvn", "엠빅", "비디오머그");
    /** 임베드 가능 후보를 찾기 위해 확인할 상위 후보 수 상한(불필요한 크롤 방지). */
    private static final int MAX_EMBED_CHECKS = 5;

    /**
     * 후보 중 하이라이트로 가장 적합하면서 '임베드 재생 가능한' 영상 선택.
     * FIFA 공식 영상은 외부 사이트 재생(임베드)이 막혀 있어, 한국 방송사(KBS/SBS/MBC/JTBC 등)를
     * 우선하고 FIFA·타종목은 후순위로 점수화한 뒤, 상위 후보부터 실제 임베드 가능한 첫 영상을 고른다.
     * 임베드 가능한 후보가 없으면 null(막힌 영상 대신 아무것도 안 보여줌 → 잠시 후 재시도).
     */
    private String pickBest(YoutubeSearchResponse res, String home, String away) {
        if (res == null || res.videos() == null || res.videos().isEmpty()) {
            return null;
        }
        String h = lastWord(home).toLowerCase();
        String a = lastWord(away).toLowerCase();

        // 점수 높은 순으로 정렬 — 한국 방송사 우선, FIFA/타종목 후순위
        List<Video> ranked = res.videos().stream()
                .sorted(Comparator.comparingInt((Video v) -> score(v, h, a)).reversed())
                .toList();

        int checked = 0;
        for (Video v : ranked) {
            int s = score(v, h, a);
            if (s <= 0 || checked >= MAX_EMBED_CHECKS) break;   // 관련 없거나(FIFA/타종목) 확인 한도 초과
            checked++;
            if (youtubeClient.isEmbeddable(v.videoId())) {
                log.info("[highlight] 선택 videoId={} ch={} title={}", v.videoId(), v.channel(), v.title());
                return v.videoId();
            }
            log.info("[highlight] 임베드 불가 건너뜀 videoId={} ch={}", v.videoId(), v.channel());
        }
        return null;
    }

    /** 후보 적합도 점수: 한국 방송사 +100, FIFA -200, 하이라이트 키워드 +20, 팀명 일치 +8씩, 타종목 -100. */
    private int score(Video v, String h, String a) {
        String ch = v.channel() == null ? "" : v.channel().toLowerCase();
        String t = v.title() == null ? "" : v.title().toLowerCase();
        int s = 0;
        if (isPreferredChannel(ch)) s += 100;
        if (ch.contains("fifa")) s -= 200;            // 임베드 차단 잦음 → 사실상 제외
        if (t.contains("highlight") || t.contains("하이라이트")) s += 20;
        if (t.contains(h)) s += 8;
        if (t.contains(a)) s += 8;
        if (t.contains("baseball") || t.contains("야구") || t.contains("basketball")) s -= 100;  // 타종목 오인 방지
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
}
