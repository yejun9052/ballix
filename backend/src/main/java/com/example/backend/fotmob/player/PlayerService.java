package com.example.backend.fotmob.player;

import com.example.backend.fotmob.FotmobClient;
import com.example.backend.fotmob.dto.FotmobMatchResponse.LineupDto;
import com.example.backend.fotmob.dto.FotmobPlayerResponse;
import com.example.backend.match.Match;
import com.example.backend.team.Team;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 선수(Player) 영속·조회. 상세(프로필+시즌 스탯)는 DB-first lazy-cache:
 * 모달 첫 조회 시 1회 크롤·저장 후 이후엔 DB에서만 읽는다(staleness TTL 내).
 * <p>
 * HTTP-in-transaction 방지: 크롤(HTTP)은 트랜잭션 밖, DB 저장만 self.applyDetail(독립 트랜잭션).
 * (FotmobSyncService/MatchHighlightService와 동일 패턴)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlayerService {

    private final PlayerRepository playerRepository;
    private final FotmobClient fotmobClient;

    @Lazy
    @Autowired
    private PlayerService self;

    /** info/stats JSON 직렬화용 — Spring(Jackson3) 컨버터와 무관한 독립 2.x 매퍼. */
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 상세 재크롤 주기(이 시간 지난 캐시는 다시 크롤). */
    private static final long DETAIL_TTL_HOURS = 12;
    /** 크롤 실패 후 재시도 억제(폭주 방지). */
    private static final long FAIL_COOLDOWN_MINUTES = 5;

    private final Map<Long, LocalDateTime> lastFailed = new ConcurrentHashMap<>();

    private static String photoUrl(Long id) {
        return id == null ? null : "https://images.fotmob.com/image_resources/playerimages/" + id + ".png";
    }

    /** 선수 상세 조회 — DB에 신선한 캐시가 있으면 그걸, 없으면 1회 크롤·저장 후 반환. */
    public FotmobPlayerResponse getOrFetch(Long fotmobPlayerId) {
        Player player = playerRepository.findByFotmobPlayerId(fotmobPlayerId).orElse(null);

        if (player != null && isFresh(player)) {
            return toResponse(player);
        }
        // 직전 크롤이 실패했고 쿨다운 중이면 재크롤하지 않고 현재 상태(있으면)로 반환.
        LocalDateTime failedAt = lastFailed.get(fotmobPlayerId);
        if (failedAt != null
                && ChronoUnit.MINUTES.between(failedAt, LocalDateTime.now()) < FAIL_COOLDOWN_MINUTES) {
            return player != null ? toResponse(player) : empty(fotmobPlayerId);
        }

        try {
            FotmobPlayerResponse crawled = fotmobClient.getPlayer(fotmobPlayerId);   // HTTP (트랜잭션 밖)
            self.applyDetail(fotmobPlayerId, crawled);                                // DB 저장 (독립 트랜잭션)
            lastFailed.remove(fotmobPlayerId);
            return crawled;
        } catch (Exception e) {
            lastFailed.put(fotmobPlayerId, LocalDateTime.now());
            log.warn("[player] 상세 크롤 실패 fotmobPlayerId={} : {}", fotmobPlayerId, e.toString());
            return player != null ? toResponse(player) : empty(fotmobPlayerId);
        }
    }

    /** 크롤 결과(상세)를 Player에 저장(업서트). */
    @Transactional
    public void applyDetail(Long fotmobPlayerId, FotmobPlayerResponse r) {
        if (r == null) return;
        Player player = playerRepository.findByFotmobPlayerId(fotmobPlayerId)
                .orElseGet(() -> Player.builder().fotmobPlayerId(fotmobPlayerId).name("").build());
        player.updateDetail(r.name(), r.teamId(), r.teamName(), r.teamCrest(),
                r.position(), r.onLoan(), r.leagueName(), r.season(),
                writeJson(r.info()), writeJson(r.stats()));
        playerRepository.save(player);
    }

    /**
     * 라인업 동기화 시 dto들의 선수를 업서트(식별·소속팀만)하고 fotmobPlayerId→Player 맵을 반환.
     * 호출자(FotmobSyncService)의 트랜잭션 안에서 실행된다(별도 HTTP 없음).
     * playerId가 없는 dto는 맵에 포함하지 않는다(키 없음 → 라인업에서 건너뜀).
     */
    public Map<Long, Player> upsertBasicForLineup(Match match, List<LineupDto> dtos) {
        List<Long> ids = dtos.stream()
                .map(LineupDto::playerId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (ids.isEmpty()) return Collections.emptyMap();

        Map<Long, Player> byId = new HashMap<>();
        for (Player p : playerRepository.findByFotmobPlayerIdIn(ids)) {
            byId.put(p.getFotmobPlayerId(), p);
        }

        Team home = match.getHomeTeam();
        Team away = match.getAwayTeam();
        List<Player> toSave = new ArrayList<>();
        for (LineupDto d : dtos) {
            Long pid = d.playerId();
            if (pid == null) continue;
            Team team = d.isHome() ? home : away;
            Long teamId = team != null ? team.getFotmobTeamId() : null;
            String teamName = team != null ? team.getName() : null;
            String teamCrest = team != null ? team.getCrest() : null;
            String name = d.name() == null ? "" : d.name();

            Player p = byId.get(pid);
            if (p == null) {
                p = Player.builder().fotmobPlayerId(pid).name(name).build();
                byId.put(pid, p);
            }
            p.updateBasic(name, teamId, teamName, teamCrest);
            toSave.add(p);
        }
        playerRepository.saveAll(toSave);
        return byId;
    }

    private boolean isFresh(Player p) {
        return p.getDetailFetchedAt() != null
                && ChronoUnit.HOURS.between(p.getDetailFetchedAt(), LocalDateTime.now()) < DETAIL_TTL_HOURS;
    }

    private FotmobPlayerResponse toResponse(Player p) {
        return new FotmobPlayerResponse(
                p.getFotmobPlayerId(), p.getName(), p.getTeamId(), p.getTeamName(), p.getTeamCrest(),
                p.getOnLoan(), p.getPosition(), photoUrl(p.getFotmobPlayerId()),
                p.getLeagueName(), p.getSeason(),
                readInfo(p.getInfoJson()), readStats(p.getStatsJson()));
    }

    private FotmobPlayerResponse empty(Long fotmobPlayerId) {
        return new FotmobPlayerResponse(fotmobPlayerId, null, null, null, null, null, null,
                photoUrl(fotmobPlayerId), null, null, List.of(), List.of());
    }

    private static String writeJson(Object value) {
        if (value == null) return null;
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private static List<FotmobPlayerResponse.Info> readInfo(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return MAPPER.readValue(json, new TypeReference<List<FotmobPlayerResponse.Info>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private static List<FotmobPlayerResponse.Stat> readStats(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return MAPPER.readValue(json, new TypeReference<List<FotmobPlayerResponse.Stat>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
