package com.example.backend.match;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.NotFoundException;
import com.example.backend.team.Team;
import com.example.backend.youtube.YoutubeClient;
import com.example.backend.youtube.dto.YoutubeSearchResponse;
import com.example.backend.youtube.dto.YoutubeSearchResponse.Video;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
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

    // 자기 자신 프록시 — 일괄 보강 루프에서 getOrFetch를 '경기별 독립 트랜잭션'으로 부르기 위함
    // (자기호출은 프록시를 우회해 @Transactional이 무시되고, 스케줄러 스레드엔 OSIV가 없어 LAZY 연관 로드가 깨진다)
    @Lazy
    @Autowired
    private MatchHighlightService self;

    // 검색 실패(또는 후보 없음) 시 N분 동안 재검색 억제 — 매 조회마다 유튜브 크롤 폭주 방지
    private static final long FAIL_COOLDOWN_MINUTES = 30;
    private final Map<Long, LocalDateTime> failedAt = new ConcurrentHashMap<>();

    /**
     * 종료됐는데 다시보기 영상이 없는 최근 경기를 일괄 보강 — 스케줄러/관리자 수동 트리거 공용.
     * 경기별로 {@code self.getOrFetch}(프록시 경유 → 독립 트랜잭션, LAZY 연관 로드 보장)를 호출한다.
     * 이미 영상이 있는 경기(수동 등록 포함)는 대상 쿼리에서 빠지고, 후보 없으면 30분 쿨다운.
     * @return 이번 호출로 영상이 채워진 경기 수
     */
    public int backfillHighlights(int limit, int sinceDays) {
        int max = Math.max(1, Math.min(limit, 20));
        int days = Math.max(1, Math.min(sinceDays, 30));
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        List<Match> targets = matchRepository.findHighlightBackfillTargets(since, PageRequest.of(0, max));
        int filled = 0;
        for (Match m : targets) {
            try {
                Match r = self.getOrFetch(m.getId());   // 프록시 경유 → 경기별 독립 트랜잭션
                if (r.getReplayYoutubeId() != null && !r.getReplayYoutubeId().isBlank()) {
                    filled++;
                    log.info("[highlight-backfill] matchId={} 채움 videoId={}", m.getId(), r.getReplayYoutubeId());
                }
            } catch (Exception e) {
                log.warn("[highlight-backfill] matchId={} 실패: {}", m.getId(), e.getMessage());
            }
        }
        log.info("[highlight-backfill] 보강 {}건 채움 / 대상 {}건 (최근 {}일, 최대 {}건)", filled, targets.size(), days, max);
        return filled;
    }

    /**
     * 특정 경기 하이라이트 강제 재동기화(관리자) — 기존(잘못 등록된) 영상을 비우고 쿨다운을 풀어 즉시 재검색.
     * 일괄 보강(backfillHighlights)이 '영상 없는 여러 경기'를 훑는 것과 달리, 경기 1건을 지정해 다시 찾는다.
     * 재검색에 실패(적합 후보 없음)하면 영상은 빈 상태로 남는다(잘못된 영상 제거가 목적이므로 의도된 동작).
     */
    @Transactional
    public Match resyncHighlight(Long matchId) {
        Match match = matchRepository.findById(matchId)
                .orElseThrow(() -> new NotFoundException("경기를 찾을 수 없습니다."));
        if (!match.isFotmobFinalized() && !"FINISHED".equals(match.getStatus())) {
            throw new BadRequestException("아직 종료되지 않은 경기는 하이라이트를 가져올 수 없습니다.");
        }
        failedAt.remove(matchId);   // 쿨다운 해제
        match.clearReplay();        // 기존 영상 비움 → getOrFetch가 재검색하도록
        matchRepository.save(match);
        return self.getOrFetch(matchId);   // 프록시 경유(같은 트랜잭션 참여) — 비워진 상태에서 재검색
    }

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
        // 방송사가 흔히 쓰는 약칭(한국/남아공)을 우선 써야 정식명(대한민국/남아프리카공화국)보다 영상이 잘 잡힌다.
        String homeKo = searchKo(match.getHomeTeam());
        String awayKo = searchKo(match.getAwayTeam());
        boolean korean = homeKo != null && awayKo != null;
        String query = korean
                ? homeKo + " " + awayKo + " 하이라이트"
                : home + " vs " + away + " highlights";

        try {
            YoutubeSearchResponse res = youtubeClient.search(query);
            String videoId = pickBest(res, match.getHomeTeam(), match.getAwayTeam());
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
     * 방송사가 흔히 쓰는 약칭(정식 한글명/영문명과 안 맞는 경우) — 영문 팀명(소문자) → 제목에서 찾을 한글 토큰들.
     * 예: 제목은 "남아공"인데 nameKo는 "남아프리카공화국", 제목은 "한국"인데 nameKo는 "대한민국"이라 안 맞던 문제 보정.
     */
    private static final Map<String, List<String>> NAME_ALIASES = Map.ofEntries(
            Map.entry("south korea", List.of("한국", "대한민국", "코리아")),
            Map.entry("korea republic", List.of("한국", "대한민국", "코리아")),
            Map.entry("south africa", List.of("남아공", "남아프리카공화국", "남아프리카")),
            Map.entry("bosnia and herzegovina", List.of("보스니아", "보스니아헤르체고비나")),
            Map.entry("north macedonia", List.of("북마케도니아", "마케도니아")),
            Map.entry("saudi arabia", List.of("사우디아라비아", "사우디")),
            Map.entry("uzbekistan", List.of("우즈베키스탄", "우즈벡")),
            Map.entry("ivory coast", List.of("코트디부아르", "아이보리코스트")),
            Map.entry("czechia", List.of("체코", "체코공화국")),
            Map.entry("dr congo", List.of("dr콩고", "콩고")),
            Map.entry("united states", List.of("미국")),
            Map.entry("usa", List.of("미국")),
            Map.entry("turkiye", List.of("튀르키예", "터키")));

    /**
     * 한국 방송사 채널 + '양 팀이 모두 제목에 나오는' 영상 중 임베드 가능한 첫 영상 선택.
     * <p>핵심: 제목에 <b>홈·원정 두 팀이 다 언급</b>돼야 후보가 된다 — 예전엔 한 팀만 맞거나 "하이라이트"
     * 키워드만 있어도 통과해서 "한국 vs 남아공"인데 "남아공 vs 체코" 영상을 가져오는 오선택이 있었다.
     * 채널이 PREFERRED_CHANNELS가 아니거나, 한 팀이라도 제목에 없거나, 타종목이면 제외.
     * 적합 후보가 없거나 전부 임베드 불가면 null(엉뚱한 영상 대신 아무것도 안 보여줌 → 잠시 후 재시도).
     */
    private String pickBest(YoutubeSearchResponse res, Team home, Team away) {
        if (res == null || res.videos() == null || res.videos().isEmpty()) {
            return null;
        }
        List<String> homeTokens = teamTokens(home);
        List<String> awayTokens = teamTokens(away);

        List<Video> candidates = res.videos().stream()
                .filter(v -> isPreferredChannel(lower(v.channel())))     // 한국 방송사만
                .filter(v -> {
                    String t = lower(v.title());
                    // 양 팀이 모두 제목에 있고(상대팀 오선택 차단) + 타종목이 아니어야 함
                    return titleHasTeam(t, homeTokens) && titleHasTeam(t, awayTokens) && !isOtherSport(t);
                })
                .sorted(Comparator.comparingInt((Video v) -> relevance(v)).reversed())
                .toList();

        int checked = 0;
        for (Video v : candidates) {
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

    /** 양 팀 매칭을 통과한 후보들의 정렬용 — 하이라이트 키워드가 있으면 우선. */
    private int relevance(Video v) {
        String t = lower(v.title());
        return (t.contains("highlight") || t.contains("하이라이트")) ? 20 : 0;
    }

    /** 제목(소문자)에 팀의 토큰 중 하나라도 들어 있으면 그 팀이 언급된 것으로 본다. */
    private boolean titleHasTeam(String titleLower, List<String> teamTokens) {
        for (String tok : teamTokens) {
            if (!tok.isBlank() && titleLower.contains(tok)) return true;
        }
        return false;
    }

    /** 한 팀을 제목에서 찾기 위한 토큰 집합 — 영문 전체/마지막 단어 + 한글명 + 약칭(alias). 모두 소문자. */
    private List<String> teamTokens(Team t) {
        List<String> toks = new ArrayList<>();
        if (t == null) return toks;
        String en = lower(t.getName());
        if (!en.isBlank()) {
            toks.add(en);
            String last = lastWord(en);
            if (last.length() >= 4) toks.add(last);   // 짧은 단어(usa 등)는 오매칭 우려로 제외 — 한글/약칭이 커버
            List<String> aliases = NAME_ALIASES.get(en);
            if (aliases != null) toks.addAll(aliases);
        }
        String ko = t.getNameKo();
        if (ko != null && !ko.isBlank()) {
            String kol = ko.toLowerCase().trim();
            toks.add(kol);
            String noSpace = kol.replace(" ", "");
            if (!noSpace.equals(kol)) toks.add(noSpace);
        }
        return toks;
    }

    private boolean isOtherSport(String titleLower) {
        return titleLower.contains("baseball") || titleLower.contains("야구")
                || titleLower.contains("basketball") || titleLower.contains("농구")
                || titleLower.contains("volleyball") || titleLower.contains("배구");
    }

    private boolean isPreferredChannel(String channel) {
        for (String c : PREFERRED_CHANNELS) {
            if (channel.contains(c)) return true;
        }
        return false;
    }

    private String lower(String s) {
        return s == null ? "" : s.toLowerCase();
    }

    /** "South Korea" → "korea" 처럼 팀명 마지막 단어(국가명 매칭률↑). */
    private String lastWord(String name) {
        String[] parts = name.trim().split("\\s+");
        return parts.length == 0 ? name : parts[parts.length - 1];
    }

    private String teamName(Team t) {
        return t == null ? null : t.getName();
    }

    /** 한국어 팀명(번역된 nameKo) — 없으면 null. */
    private String teamNameKo(Team t) {
        if (t == null) return null;
        String ko = t.getNameKo();
        return (ko == null || ko.isBlank()) ? null : ko;
    }

    /** 검색어에 쓸 한국어 팀명 — 방송사 흔한 약칭(alias) 우선, 없으면 nameKo. 둘 다 없으면 null. */
    private String searchKo(Team t) {
        if (t == null) return null;
        List<String> aliases = NAME_ALIASES.get(lower(t.getName()));
        if (aliases != null && !aliases.isEmpty()) return aliases.get(0);
        return teamNameKo(t);
    }
}
