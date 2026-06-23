package com.example.backend.playercard;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.fotmob.player.Player;
import com.example.backend.fotmob.player.PlayerRepository;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlayerCardService {

    private final PlayerCardRepository playerCardRepository;
    private final PlayerRepository playerRepository;
    private final UserRepository userRepository;
    private final EntityManager em;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ── 오버롤 산출 기준값 (정규화 분모) ───────────────────────────────────
    // 모든 스탯은 90분 환산 후 0~1로 정규화 → 포지션별 가중합 → overall = 60 + score×39
    // Rating: 5.5(하한) ~ 8.5(상한)
    private static final double R_MIN = 5.5, R_MAX = 8.5;
    // 공격 스탯 (top-flight 시즌 기준 최대치)
    private static final double GOALS_MAX       = 0.80; // 골/90
    private static final double XG_MAX          = 0.70; // xG/90
    private static final double ASSISTS_MAX     = 0.40; // 어시/90
    private static final double XA_MAX          = 0.40; // xA/90
    private static final double SHOTS_ON_MAX    = 60.0; // 슈팅 정확도 %
    private static final double CHANCES_MAX     = 3.00; // 찬스 창출/90
    // 패스/드리블/듀얼
    private static final double PASS_MIN        = 60.0; // 패스 정확도 하한 %
    private static final double PASS_MAX        = 96.0; // 패스 정확도 상한 %
    private static final double DRIBBLE_MAX     = 80.0; // 드리블 성공률 %
    private static final double DUEL_MIN        = 30.0; // 듀얼 승률 하한 %
    private static final double DUEL_MAX        = 70.0; // 듀얼 승률 상한 %
    private static final double AERIAL_MIN      = 20.0; // 공중볼 승률 하한 %
    private static final double AERIAL_MAX      = 80.0; // 공중볼 승률 상한 %
    // 수비 스탯
    private static final double TACKLE_MAX      = 4.00; // 태클/90
    private static final double INTERCEPT_MAX   = 2.50; // 인터셉트/90
    private static final double CLEARANCE_MAX   = 6.00; // 클리어링/90
    // GK 스탯
    private static final double SAVE_PCT_MIN    = 50.0; // 선방률 하한 %
    private static final double SAVE_PCT_MAX    = 90.0; // 선방률 상한 %
    private static final double CLEAN_SHEET_MAX = 0.50; // 무실점/경기
    private static final double GOAL_PREV_MAX   = 15.0; // 기대실점 방어 (시즌)

    // 스탯 없는 선수 기본 오버롤
    private static final int DEFAULT_OVERALL = 65;

    // ── 뽑기 ───────────────────────────────────────────────────────────────

    @Transactional
    public List<PlayerCardView> draw(Long userId, int count) {
        if (userId == null) throw new UnauthorizedException("로그인이 필요합니다.");
        if (count != 1 && count != 10) throw new BadRequestException("count는 1 또는 10만 가능합니다.");

        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("유저를 찾을 수 없습니다."));

        List<SoccerPlayerDto> pool = getPool();
        if (pool.isEmpty()) throw new BadRequestException("선수 데이터가 없습니다.");

        List<SoccerPlayerDto> drawn = weightedDraw(pool, count);

        List<PlayerCardView> result = new ArrayList<>();
        for (SoccerPlayerDto p : drawn) {
            PlayerCard card = PlayerCard.create(
                    owner, p.name(), p.nationality(), p.overall(),
                    p.position(), p.team(), p.imageUrl()
            );
            result.add(PlayerCardView.from(playerCardRepository.save(card)));
        }
        return result;
    }

    // 내 카드 목록
    @Transactional(readOnly = true)
    public List<PlayerCardView> myCards(Long userId) {
        if (userId == null) throw new UnauthorizedException("로그인이 필요합니다.");
        return playerCardRepository.findByOwnerIdOrderByCreateAtDesc(userId)
                .stream().map(PlayerCardView::from).toList();
    }

    // ── 선수 풀 빌드 ────────────────────────────────────────────────────────

    // Player 테이블 전체 + 라인업 평균 rating 조인
    // [fotmobPlayerId, name, teamName, position, imageUrl, nationality,
    //  avgRating(Double or null), statsJson(String or null)]
    @SuppressWarnings("unchecked")
    private List<SoccerPlayerDto> getPool() {
        // JPQL: Player 테이블 LEFT JOIN lineup_player 평균 rating
        List<Object[]> rows = em.createQuery("""
                SELECT p.fotmobPlayerId, p.name, p.teamName, p.position,
                       p.statsJson, AVG(lp.rating)
                FROM Player p
                LEFT JOIN LineupPlayer lp ON lp.player = p
                WHERE p.name IS NOT NULL
                GROUP BY p.fotmobPlayerId, p.name, p.teamName, p.position, p.statsJson
                """).getResultList();

        List<SoccerPlayerDto> pool = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Long fotmobId  = (Long)   row[0];
            String name    = (String) row[1];
            String team    = (String) row[2];
            String pos     = (String) row[3];
            String statsJs = (String) row[4];
            Double avgRat  = row[5] != null ? ((Number) row[5]).doubleValue() : null;

            if (name == null || name.isBlank()) continue;

            int overall = computeOverall(pos, statsJs, avgRat);
            // FotMob 선수 이미지 URL — 프론트와 동일하게 구성
            String imageUrl = fotmobId != null
                    ? "https://images.fotmob.com/image_resources/playerimages/" + fotmobId + ".png"
                    : null;

            pool.add(new SoccerPlayerDto(
                    fotmobId != null ? fotmobId.toString() : name,
                    name, team != null ? team : "", pos != null ? pos : "",
                    "", imageUrl, overall
            ));
        }
        return pool;
    }

    // ── 오버롤 계산 ─────────────────────────────────────────────────────────

    /**
     * 선수 오버롤 산출.
     * 1순위: stats_json(시즌 스탯) → 포지션별 가중합
     * 2순위: 라인업 평균 rating → 스케일 변환
     * 3순위: 기본값 65
     */
    private int computeOverall(String position, String statsJson, Double avgRating) {
        // 1순위: 시즌 스탯
        if (statsJson != null && !statsJson.isBlank()) {
            try {
                List<Map<String, Object>> stats = objectMapper.readValue(
                        statsJson, new TypeReference<>() {});
                Map<String, Double> s = parseStats(stats);
                double score = scoreByPosition(position, s);
                return clampOverall(60 + (int) Math.round(score * 39));
            } catch (Exception e) {
                log.debug("stats_json 파싱 실패({}): {}", position, e.getMessage());
            }
        }

        // 2순위: 라인업 평균 평점
        if (avgRating != null) {
            double score = norm(avgRating, R_MIN, R_MAX);
            return clampOverall(60 + (int) Math.round(score * 39));
        }

        // 3순위: 기본값
        return DEFAULT_OVERALL;
    }

    /**
     * 포지션 그룹 판별 후 가중합 계산.
     *
     * GK:
     *   score = Rating×0.35 + 선방률×0.25 + 무실점비율×0.15
     *           + 기대실점방어×0.10 + 선방수/경기×0.10 + 페널티선방률×0.05
     *
     * DEF (CB, LB, RB, Defender):
     *   score = Rating×0.30 + 듀얼승률×0.20 + 태클/90×0.15 + 인터셉트/90×0.12
     *           + 공중볼승률×0.10 + 패스정확도×0.08 + 클리어링/90×0.05
     *
     * MID_DEF (DM, Defensive):
     *   score = Rating×0.25 + 태클/90×0.20 + 인터셉트/90×0.15 + 듀얼승률×0.15
     *           + 패스정확도×0.15 + xA/90×0.10
     *
     * MID (CM, AM, CAM, Midfielder):
     *   score = Rating×0.25 + 패스정확도×0.20 + xA/90×0.15 + xG/90×0.10
     *           + 찬스창출/90×0.10 + 드리블성공률×0.08 + 듀얼승률×0.07 + 태클/90×0.05
     *
     * FWD (ST, LW, RW, Winger, Attacker, Forward):
     *   score = Rating×0.25 + 골/90×0.25 + xG/90×0.15 + 어시/90×0.10
     *           + xA/90×0.08 + 슈팅정확도%×0.08 + 드리블성공률×0.05 + 찬스창출/90×0.04
     */
    private double scoreByPosition(String position, Map<String, Double> s) {
        String pg = positionGroup(position);

        double rating = norm(s.getOrDefault("Rating", 6.8), R_MIN, R_MAX);
        double minutes = Math.max(s.getOrDefault("Minutes played", 0.0), 1.0);
        double matches = Math.max(s.getOrDefault("Matches", 1.0), 1.0);
        // 90분 환산 계수
        double p90 = 90.0 / (minutes / matches);

        switch (pg) {
            case "GK" -> {
                double saves       = s.getOrDefault("Saves", 0.0) / matches;
                double savePct     = s.getOrDefault("Save percentage", 65.0);
                double cleanSheet  = s.getOrDefault("Clean sheets", 0.0) / matches;
                double goalPrev    = s.getOrDefault("Goals prevented", 0.0);
                double penSavePct  = s.getOrDefault("Penalty save %", 30.0) / 100.0;
                return rating * 0.35
                        + norm(savePct, SAVE_PCT_MIN, SAVE_PCT_MAX) * 0.25
                        + norm(cleanSheet, 0, CLEAN_SHEET_MAX) * 0.15
                        + norm(goalPrev, 0, GOAL_PREV_MAX) * 0.10
                        + norm(saves, 0, 5.0) * 0.10    // 경기당 선방 5개 = 최대
                        + Math.min(penSavePct, 1.0) * 0.05;
            }
            case "DEF" -> {
                double duelPct    = s.getOrDefault("Duels won %", 45.0);
                double tackle     = s.getOrDefault("Tackles", 0.0) * p90;
                double intercept  = s.getOrDefault("Interceptions", 0.0) * p90;
                double aerialPct  = s.getOrDefault("Aerials won %", 40.0);
                double passAcc    = s.getOrDefault("Pass accuracy", 70.0);
                double clearance  = s.getOrDefault("Clearances", 0.0) * p90;
                return rating * 0.30
                        + norm(duelPct, DUEL_MIN, DUEL_MAX) * 0.20
                        + norm(tackle, 0, TACKLE_MAX) * 0.15
                        + norm(intercept, 0, INTERCEPT_MAX) * 0.12
                        + norm(aerialPct, AERIAL_MIN, AERIAL_MAX) * 0.10
                        + norm(passAcc, PASS_MIN, PASS_MAX) * 0.08
                        + norm(clearance, 0, CLEARANCE_MAX) * 0.05;
            }
            case "MID_DEF" -> {
                double tackle    = s.getOrDefault("Tackles", 0.0) * p90;
                double intercept = s.getOrDefault("Interceptions", 0.0) * p90;
                double duelPct   = s.getOrDefault("Duels won %", 45.0);
                double passAcc   = s.getOrDefault("Pass accuracy", 75.0);
                double xA        = s.getOrDefault("xA", 0.0) * p90;
                return rating * 0.25
                        + norm(tackle, 0, TACKLE_MAX) * 0.20
                        + norm(intercept, 0, INTERCEPT_MAX) * 0.15
                        + norm(duelPct, DUEL_MIN, DUEL_MAX) * 0.15
                        + norm(passAcc, PASS_MIN, PASS_MAX) * 0.15
                        + norm(xA, 0, XA_MAX) * 0.10;
            }
            case "FWD" -> {
                double goals     = s.getOrDefault("Goals", 0.0) * p90;
                double xg        = s.getOrDefault("xG", 0.0) * p90;
                double assists   = s.getOrDefault("Assists", 0.0) * p90;
                double xa        = s.getOrDefault("xA", 0.0) * p90;
                double shotAcc   = s.getOrDefault("Shots on target", 0.0)
                        / Math.max(s.getOrDefault("Shots", 1.0), 1) * 100.0;
                double dribble   = s.getOrDefault("Dribbles success rate", 40.0);
                double chances   = s.getOrDefault("Chances created", 0.0) * p90;
                return rating * 0.25
                        + norm(goals, 0, GOALS_MAX) * 0.25
                        + norm(xg, 0, XG_MAX) * 0.15
                        + norm(assists, 0, ASSISTS_MAX) * 0.10
                        + norm(xa, 0, XA_MAX) * 0.08
                        + norm(shotAcc, 0, SHOTS_ON_MAX) * 0.08
                        + norm(dribble, 0, DRIBBLE_MAX) * 0.05
                        + norm(chances, 0, CHANCES_MAX) * 0.04;
            }
            default -> { // MID (CM, AM, 기타)
                double passAcc = s.getOrDefault("Pass accuracy", 75.0);
                double xa      = s.getOrDefault("xA", 0.0) * p90;
                double xg      = s.getOrDefault("xG", 0.0) * p90;
                double chances = s.getOrDefault("Chances created", 0.0) * p90;
                double dribble = s.getOrDefault("Dribbles success rate", 40.0);
                double duelPct = s.getOrDefault("Duels won %", 45.0);
                double tackle  = s.getOrDefault("Tackles", 0.0) * p90;
                return rating * 0.25
                        + norm(passAcc, PASS_MIN, PASS_MAX) * 0.20
                        + norm(xa, 0, XA_MAX) * 0.15
                        + norm(xg, 0, XG_MAX) * 0.10
                        + norm(chances, 0, CHANCES_MAX) * 0.10
                        + norm(dribble, 0, DRIBBLE_MAX) * 0.08
                        + norm(duelPct, DUEL_MIN, DUEL_MAX) * 0.07
                        + norm(tackle, 0, TACKLE_MAX) * 0.05;
            }
        }
    }

    /** FotMob stats_json [{title, value}] → title 키 Map<String, Double> */
    private Map<String, Double> parseStats(List<Map<String, Object>> stats) {
        Map<String, Double> result = new HashMap<>();
        for (Map<String, Object> entry : stats) {
            Object titleObj = entry.get("title");
            Object valueObj = entry.get("value");
            if (titleObj == null || valueObj == null) continue;
            String title = titleObj.toString();
            try {
                // "3/6" 형태(페널티 선방) → 첫 번째 숫자
                String valStr = valueObj.toString().split("/")[0].trim();
                result.put(title, Double.parseDouble(valStr));
            } catch (NumberFormatException ignored) {}
        }
        return result;
    }

    /** 포지션 문자열 → 그룹 키 */
    private String positionGroup(String pos) {
        if (pos == null || pos.isBlank()) return "MID";
        String p = pos.toLowerCase();
        if (p.contains("keeper") || p.contains("goalkeeper") || p.equals("gk")) return "GK";
        if (p.contains("defensive mid") || p.contains("defensive midfielder")) return "MID_DEF";
        if (p.contains("back") || p.contains("defender") || p.contains("center back")
                || p.contains("centre back")) return "DEF";
        if (p.contains("forward") || p.contains("striker") || p.contains("winger")
                || p.contains("wing") || p.contains("left wing") || p.contains("right wing")
                || p.contains("attacking")) return "FWD";
        return "MID";
    }

    // ── 가중치 뽑기 ─────────────────────────────────────────────────────────

    // 오버롤 높을수록 드물게(가중치 반비례)
    private List<SoccerPlayerDto> weightedDraw(List<SoccerPlayerDto> pool, int count) {
        List<SoccerPlayerDto> weighted = new ArrayList<>();
        for (SoccerPlayerDto p : pool) {
            // 레전드(95+)=1, 월드클래스(90+)=2, 탑클래스(80+)=4, 하위=8
            int w = p.overall() >= 95 ? 1 : p.overall() >= 90 ? 2 : p.overall() >= 80 ? 4 : 8;
            for (int i = 0; i < w; i++) weighted.add(p);
        }

        Set<String> picked = new HashSet<>();
        List<SoccerPlayerDto> result = new ArrayList<>();
        int max = Math.min(count, pool.size());
        Random rng = new Random();
        int guard = 0;

        while (result.size() < max && guard < max * 300) {
            guard++;
            SoccerPlayerDto c = weighted.get(rng.nextInt(weighted.size()));
            if (picked.contains(c.id())) continue;
            picked.add(c.id());
            result.add(c);
        }
        return result;
    }

    // ── 유틸 ────────────────────────────────────────────────────────────────

    /** 0~1 정규화 (범위 밖은 클램프) */
    private double norm(double v, double min, double max) {
        if (max <= min) return 0.0;
        return Math.max(0.0, Math.min(1.0, (v - min) / (max - min)));
    }

    private int clampOverall(int v) {
        return Math.max(60, Math.min(99, v));
    }

    // 내부 DTO
    record SoccerPlayerDto(
            String id, String name, String team, String position,
            String nationality, String imageUrl, int overall) {}
}
