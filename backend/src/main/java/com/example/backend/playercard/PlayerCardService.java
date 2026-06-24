package com.example.backend.playercard;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 선수 카드 뽑기 서비스.
 *
 * ── 오버롤 산출 공식 ──────────────────────────────────────────────────────────
 *
 * 모든 볼륨 스탯은 90분 환산 후 참조 최대치(REF_*)로 나눠 0~1 정규화.
 * 비율 스탯(%, rating)은 선형 정규화.
 * 최종: overall = 60 + round(가중합 × 39)   → 60~99
 *
 * [GK]
 *   Rating(평균)×0.25 + 선방률(%)×0.25 + 무실점비율×0.20
 *   + 기대실점방어(시즌)×0.10 + 선방수/90×0.10
 *   + 패스정확도(%)×0.05 + 페널티선방률(%)×0.05
 *   페널티: 레드카드 1장당 -0.04
 *
 * [CB]
 *   Rating×0.20 + 클리어링/90×0.18 + 공중볼승률(%)×0.15
 *   + 태클/90×0.12 + 인터셉트/90×0.12 + 패스정확도(%)×0.10
 *   + 듀얼승률(%)×0.08 + (골+어시)/90×0.05
 *   페널티: 레드카드 1장당 -0.04
 *
 * [LB/RB]
 *   Rating×0.18 + 태클/90×0.14 + 클리어링/90×0.12
 *   + 인터셉트/90×0.10 + 어시/90×0.10 + 찬스창출/90×0.10
 *   + 크로스성공/90×0.08 + 패스정확도(%)×0.08
 *   + 드리블성공률(%)×0.06 + 듀얼승률(%)×0.04
 *   페널티: 레드카드 1장당 -0.04
 *
 * [DM]
 *   Rating×0.22 + 태클/90×0.18 + 인터셉트/90×0.16
 *   + 듀얼승률(%)×0.14 + 패스정확도(%)×0.14
 *   + 수비액션/90×0.08 + 리커버리/90×0.08
 *   페널티: 레드카드 1장당 -0.04
 *
 * [CM]
 *   Rating×0.18 + 패스정확도(%)×0.18 + 어시/90×0.14
 *   + 찬스창출/90×0.12 + xA/90×0.10 + 골/90×0.08
 *   + 듀얼승률(%)×0.08 + 태클/90×0.07 + 드리블성공률(%)×0.05
 *   페널티: 레드카드 1장당 -0.04
 *
 * [AM]
 *   Rating×0.18 + 골/90×0.18 + 어시/90×0.14
 *   + xG/90×0.12 + xA/90×0.10 + 찬스창출/90×0.10
 *   + 슈팅정확도(%)×0.08 + 드리블성공률(%)×0.06 + 패스정확도(%)×0.04
 *   페널티: 레드카드 1장당 -0.04
 *
 * [FWD - 윙어(LW/RW)]
 *   Rating×0.18 + 골/90×0.18 + 어시/90×0.14
 *   + xG/90×0.10 + xA/90×0.10 + 찬스창출/90×0.10
 *   + 드리블성공률(%)×0.10 + 크로스성공/90×0.06 + 슈팅정확도(%)×0.04
 *   페널티: 레드카드 1장당 -0.04
 *
 * [ST]
 *   Rating×0.18 + 골/90×0.28 + xG/90×0.14
 *   + 슈팅정확도(%)×0.10 + 어시/90×0.08
 *   + 박스터치/90×0.08 + 공중볼승률(%)×0.07 + 헤더/90×0.07
 *   페널티: 레드카드 1장당 -0.04
 *
 * ── 90분 환산 기준치(REF) ─────────────────────────────────────────────────────
 *   골/90 : 0.70 (월클ST), 어시/90 : 0.45, xG/90 : 0.65, xA/90 : 0.40
 *   태클/90 : 4.5, 인터셉트/90 : 2.8, 클리어링/90 : 7.0, 수비액션/90 : 9.0
 *   리커버리/90 : 10.0, 선방/90 : 5.5, 찬스창출/90 : 3.5
 *   크로스성공/90 : 3.0, 헤더/90 : 3.0, 박스터치/90 : 6.0
 *   기대실점방어(시즌) : 15.0
 *   (골+어시)/90 DEF : 0.20
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlayerCardService {

    private final PlayerCardRepository playerCardRepository;
    private final UserRepository userRepository;
    private final EntityManager em;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final int DEFAULT_OVERALL = 65;
    /** 카드 1장 뽑기 비용(보유 포인트). 1회=100, 10회=1000. */
    private static final int COST_PER_DRAW = 100;

    // ── 등급 추첨 확률 (1,000,000분율 누적) ─────────────────────────────────
    // 아마추어 80% / 세미프로 12% / 프로 6% / 탑 클래스 1.9% / 월드클래스 0.0999% / 레전드 0.0001%
    private static final int[]    GRADE_CUMULATIVE = { 1, 1_000, 20_000, 80_000, 200_000, 1_000_000 };
    private static final String[] GRADE_LABELS     = {
        "레전드", "월드클래스", "탑 클래스", "프로", "세미프로", "아마추어"
    };

    // ── 뽑기 ───────────────────────────────────────────────────────────────

    @Transactional
    public List<PlayerCardView> draw(Long userId, int count) {
        if (userId == null) throw new UnauthorizedException("로그인이 필요합니다.");
        if (count != 1 && count != 10) throw new BadRequestException("count는 1 또는 10만 가능합니다.");

        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("유저를 찾을 수 없습니다."));

        // 보유 포인트 차감(100P/장). 잔액 부족이면 거절.
        int cost = count * COST_PER_DRAW;
        if (owner.getPointBalance() < cost) {
            throw new BadRequestException(
                    "포인트가 부족합니다. (필요 " + cost + "P / 보유 " + owner.getPointBalance() + "P)");
        }

        List<SoccerPlayerDto> pool = getPool();
        if (pool.isEmpty()) throw new BadRequestException("선수 데이터가 없습니다.");

        Random rng = new Random();
        Set<String> picked = new HashSet<>();
        List<PlayerCardView> result = new ArrayList<>();
        int guard = 0;

        while (result.size() < count && guard < count * 500) {
            guard++;
            SoccerPlayerDto p = pool.get(rng.nextInt(pool.size()));
            if (picked.contains(p.id())) continue;
            picked.add(p.id());
            // 등급은 확률 테이블로 추첨 — 오버롤과 독립
            PlayerCard card = PlayerCard.createWithGrade(
                    owner, p.name(), p.nationality(), p.overall(),
                    p.position(), p.team(), p.imageUrl(), rollGrade(rng), p.fotmobId()
            );
            result.add(PlayerCardView.from(playerCardRepository.save(card)));
        }
        owner.deductPoints(cost);   // 관리 엔티티 — 트랜잭션 커밋 시 반영
        return result;
    }

    @Transactional(readOnly = true)
    public List<PlayerCardView> myCards(Long userId) {
        if (userId == null) throw new UnauthorizedException("로그인이 필요합니다.");
        List<PlayerCard> cards = playerCardRepository.findByOwnerIdOrderByCreateAtDesc(userId);

        // position이 비어있는 카드의 이름을 모아 Player+LineupPlayer에서 일괄 조회
        List<String> missingNames = cards.stream()
                .filter(c -> c.getPosition() == null || c.getPosition().isBlank())
                .map(PlayerCard::getPlayerName)
                .distinct()
                .toList();

        Map<String, String> posMap = new HashMap<>();
        if (!missingNames.isEmpty()) {
            List<Object[]> rows = em.createQuery("""
                    SELECT p.name, p.position, MAX(lp.position)
                    FROM Player p
                    LEFT JOIN LineupPlayer lp ON lp.player = p
                    WHERE p.name IN :names
                    GROUP BY p.name, p.position
                    """)
                    .setParameter("names", missingNames)
                    .getResultList();

            for (Object[] row : rows) {
                String name  = (String) row[0];
                String pPos  = (String) row[1];
                String lpPos = (String) row[2];
                String resolved = (pPos != null && !pPos.isBlank()) ? pPos
                               : (lpPos != null ? lpPos : "");
                if (!resolved.isBlank()) posMap.put(name, resolved);
            }
        }

        return cards.stream().map(c -> {
            // 저장된 position이 있으면 그대로, 없으면 DB 조회 결과로 채움
            String pos = (c.getPosition() != null && !c.getPosition().isBlank())
                    ? c.getPosition()
                    : posMap.getOrDefault(c.getPlayerName(), "");
            return PlayerCardView.fromWithPosition(c, pos);
        }).toList();
    }

    // ── 선수 풀 빌드 ────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<SoccerPlayerDto> getPool() {
        // MAX(lp.position): Player.position이 null인 선수의 포지션을 LineupPlayer에서 보완
        List<Object[]> rows = em.createQuery("""
                SELECT p.fotmobPlayerId, p.name, p.teamName, p.position,
                       p.statsJson, AVG(lp.rating), MAX(lp.position)
                FROM Player p
                LEFT JOIN LineupPlayer lp ON lp.player = p
                WHERE p.name IS NOT NULL
                GROUP BY p.fotmobPlayerId, p.name, p.teamName, p.position, p.statsJson
                """).getResultList();

        List<SoccerPlayerDto> pool = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Long   fotmobId = (Long)   row[0];
            String name     = (String) row[1];
            String team     = (String) row[2];
            String pos      = (String) row[3];
            String statsJs  = (String) row[4];
            Double avgRat   = row[5] != null ? ((Number) row[5]).doubleValue() : null;
            // Player.position이 없으면 LineupPlayer 포지션으로 보완
            String lpPos    = row[6] != null ? (String) row[6] : null;
            String resolvedPos = (pos != null && !pos.isBlank()) ? pos
                              : (lpPos != null ? lpPos : "");

            if (name == null || name.isBlank()) continue;

            int overall = computeOverall(resolvedPos, statsJs, avgRat);
            String imageUrl = fotmobId != null
                    ? "https://images.fotmob.com/image_resources/playerimages/" + fotmobId + ".png"
                    : null;

            pool.add(new SoccerPlayerDto(
                    fotmobId != null ? fotmobId.toString() : name,
                    name,
                    team != null ? team : "",
                    resolvedPos,
                    "",
                    imageUrl,
                    overall,
                    fotmobId
            ));
        }
        return pool;
    }

    // ── 오버롤 계산 ─────────────────────────────────────────────────────────

    private int computeOverall(String position, String statsJson, Double avgRating) {
        // 1순위: 시즌 스탯 JSON
        if (statsJson != null && !statsJson.isBlank()) {
            try {
                List<Map<String, Object>> raw = objectMapper.readValue(
                        statsJson, new TypeReference<>() {});
                Map<String, Double> s = parseStats(raw);
                double score = scoreByPosition(positionGroup(position), s);
                return clamp(60 + (int) Math.round(score * 39));
            } catch (Exception e) {
                log.debug("stats_json 파싱 실패({}): {}", position, e.getMessage());
            }
        }
        // 2순위: 라인업 평균 FotMob rating
        if (avgRating != null) {
            double score = norm(avgRating, 5.5, 8.5);
            return clamp(60 + (int) Math.round(score * 39));
        }
        // 3순위: 기본값
        return DEFAULT_OVERALL;
    }

    /**
     * 포지션 그룹별 가중합 산출.
     * 볼륨 스탯은 90분 환산, 비율 스탯은 그대로 정규화.
     * 레드카드 페널티: 1장 당 -0.04 (최대 -0.12 캡).
     */
    private double scoreByPosition(String pg, Map<String, Double> s) {
        double mins    = Math.max(s.getOrDefault("Minutes played", 90.0), 90.0);
        double matches = Math.max(s.getOrDefault("Matches", 1.0), 1.0);
        // 90분 환산 계수
        double f90 = 90.0 / (mins / matches);

        // 공통 수비 패널티: 레드카드 1장당 -0.04, 최대 3장까지 반영
        double redPenalty = Math.min(s.getOrDefault("Red cards", 0.0), 3.0) * 0.04;

        double score = switch (pg) {
            case "GK"      -> calcGK(s, matches);
            case "CB"      -> calcCB(s, f90);
            case "FB"      -> calcFB(s, f90);
            case "DM"      -> calcDM(s, f90);
            case "CM"      -> calcCM(s, f90);
            case "AM"      -> calcAM(s, f90);
            case "WINGER"  -> calcWinger(s, f90);
            case "ST"      -> calcST(s, f90);
            default        -> calcCM(s, f90); // 알 수 없는 포지션 → CM 공식 적용
        };

        return Math.max(0.0, Math.min(1.0, score - redPenalty));
    }

    // GK ─────────────────────────────────────────────────────────────────────
    private double calcGK(Map<String, Double> s, double matches) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),    5.5, 8.5);
        double savePct     = norm(s.getOrDefault("Save percentage", 65.0), 55.0, 90.0);
        double cleanRatio  = norm(s.getOrDefault("Clean sheets", 0.0) / matches, 0.0, 0.50);
        double goalPrev    = norm(s.getOrDefault("Goals prevented", 0.0), 0.0, 15.0);
        double savesP90    = norm(s.getOrDefault("Saves", 0.0) / matches, 0.0, 5.5);
        double passAcc     = norm(s.getOrDefault("Pass accuracy", 55.0), 40.0, 80.0);
        // "Penalty save %" 또는 "Saved penalties" 값 사용
        double penSavePct  = s.containsKey("Penalty save %")
                ? norm(s.get("Penalty save %"), 0.0, 100.0)
                : norm(s.getOrDefault("Penalty saves", 0.0), 0.0, 5.0);

        return rating   * 0.25
             + savePct  * 0.25
             + cleanRatio * 0.20
             + goalPrev * 0.10
             + savesP90 * 0.10
             + passAcc  * 0.05
             + penSavePct * 0.05;
    }

    // CB ─────────────────────────────────────────────────────────────────────
    private double calcCB(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),     5.5, 8.5);
        double clearance   = norm(s.getOrDefault("Clearances", 0.0) * f90,  0.0, 7.0);
        double aerialPct   = norm(s.getOrDefault("Aerials won %", 40.0),    30.0, 80.0);
        double tackle      = norm(s.getOrDefault("Tackles", 0.0)      * f90, 0.0, 4.5);
        double intercept   = norm(s.getOrDefault("Interceptions", 0.0)* f90, 0.0, 2.8);
        double passAcc     = norm(s.getOrDefault("Pass accuracy", 70.0),    60.0, 95.0);
        double duelPct     = norm(s.getOrDefault("Duels won %", 45.0),      30.0, 70.0);
        double gaP90       = norm((s.getOrDefault("Goals", 0.0) + s.getOrDefault("Assists", 0.0)) * f90,
                                   0.0, 0.20);

        return rating    * 0.20
             + clearance * 0.18
             + aerialPct * 0.15
             + tackle    * 0.12
             + intercept * 0.12
             + passAcc   * 0.10
             + duelPct   * 0.08
             + gaP90     * 0.05;
    }

    // LB / RB ─────────────────────────────────────────────────────────────────
    private double calcFB(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),         5.5, 8.5);
        double tackle      = norm(s.getOrDefault("Tackles", 0.0)      * f90, 0.0, 4.5);
        double clearance   = norm(s.getOrDefault("Clearances", 0.0)   * f90, 0.0, 5.0);
        double intercept   = norm(s.getOrDefault("Interceptions", 0.0)* f90, 0.0, 2.8);
        double assist      = norm(s.getOrDefault("Assists", 0.0)       * f90, 0.0, 0.45);
        double chances     = norm(s.getOrDefault("Chances created", 0.0)*f90, 0.0, 3.5);
        double crosses     = norm(s.getOrDefault("Successful crosses", 0.0)*f90, 0.0, 3.0);
        double passAcc     = norm(s.getOrDefault("Pass accuracy", 72.0),      60.0, 93.0);
        double dribble     = norm(s.getOrDefault("Dribbles success rate", 40.0), 20.0, 80.0);
        double duelPct     = norm(s.getOrDefault("Duels won %", 45.0),        30.0, 70.0);

        return rating    * 0.18
             + tackle    * 0.14
             + clearance * 0.12
             + intercept * 0.10
             + assist    * 0.10
             + chances   * 0.10
             + crosses   * 0.08
             + passAcc   * 0.08
             + dribble   * 0.06
             + duelPct   * 0.04;
    }

    // DM ─────────────────────────────────────────────────────────────────────
    private double calcDM(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),          5.5, 8.5);
        double tackle      = norm(s.getOrDefault("Tackles", 0.0)      * f90, 0.0, 4.5);
        double intercept   = norm(s.getOrDefault("Interceptions", 0.0)* f90, 0.0, 2.8);
        double duelPct     = norm(s.getOrDefault("Duels won %", 45.0),       30.0, 70.0);
        double passAcc     = norm(s.getOrDefault("Pass accuracy", 78.0),     65.0, 95.0);
        double defActions  = norm(s.getOrDefault("Defensive actions", 0.0)*f90, 0.0, 9.0);
        double recovery    = norm(s.getOrDefault("Recoveries", 0.0)   * f90, 0.0, 10.0);

        return rating     * 0.22
             + tackle     * 0.18
             + intercept  * 0.16
             + duelPct    * 0.14
             + passAcc    * 0.14
             + defActions * 0.08
             + recovery   * 0.08;
    }

    // CM ─────────────────────────────────────────────────────────────────────
    private double calcCM(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),          5.5, 8.5);
        double passAcc     = norm(s.getOrDefault("Pass accuracy", 78.0),     65.0, 95.0);
        double assist      = norm(s.getOrDefault("Assists", 0.0)       * f90, 0.0, 0.45);
        double chances     = norm(s.getOrDefault("Chances created", 0.0)*f90, 0.0, 3.5);
        double xA          = norm(s.getOrDefault("xA", 0.0)            * f90, 0.0, 0.40);
        double goals       = norm(s.getOrDefault("Goals", 0.0)         * f90, 0.0, 0.35);
        double duelPct     = norm(s.getOrDefault("Duels won %", 45.0),       30.0, 70.0);
        double tackle      = norm(s.getOrDefault("Tackles", 0.0)       * f90, 0.0, 4.5);
        double dribble     = norm(s.getOrDefault("Dribbles success rate", 45.0), 20.0, 80.0);

        return rating   * 0.18
             + passAcc  * 0.18
             + assist   * 0.14
             + chances  * 0.12
             + xA       * 0.10
             + goals    * 0.08
             + duelPct  * 0.08
             + tackle   * 0.07
             + dribble  * 0.05;
    }

    // AM ─────────────────────────────────────────────────────────────────────
    private double calcAM(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),          5.5, 8.5);
        double goals       = norm(s.getOrDefault("Goals", 0.0)         * f90, 0.0, 0.55);
        double assist      = norm(s.getOrDefault("Assists", 0.0)       * f90, 0.0, 0.45);
        double xG          = norm(s.getOrDefault("xG", 0.0)            * f90, 0.0, 0.50);
        double xA          = norm(s.getOrDefault("xA", 0.0)            * f90, 0.0, 0.40);
        double chances     = norm(s.getOrDefault("Chances created", 0.0)*f90, 0.0, 3.5);
        // 슈팅 정확도 = shots on target / shots × 100
        double shotAcc     = norm(shotAccuracy(s),                             0.0, 60.0);
        double dribble     = norm(s.getOrDefault("Dribbles success rate", 40.0), 20.0, 80.0);
        double passAcc     = norm(s.getOrDefault("Pass accuracy", 75.0),     60.0, 92.0);

        return rating   * 0.18
             + goals    * 0.18
             + assist   * 0.14
             + xG       * 0.12
             + xA       * 0.10
             + chances  * 0.10
             + shotAcc  * 0.08
             + dribble  * 0.06
             + passAcc  * 0.04;
    }

    // Winger (LW/RW) ─────────────────────────────────────────────────────────
    private double calcWinger(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),          5.5, 8.5);
        double goals       = norm(s.getOrDefault("Goals", 0.0)         * f90, 0.0, 0.60);
        double assist      = norm(s.getOrDefault("Assists", 0.0)       * f90, 0.0, 0.45);
        double xG          = norm(s.getOrDefault("xG", 0.0)            * f90, 0.0, 0.55);
        double xA          = norm(s.getOrDefault("xA", 0.0)            * f90, 0.0, 0.40);
        double chances     = norm(s.getOrDefault("Chances created", 0.0)*f90, 0.0, 3.5);
        double dribble     = norm(s.getOrDefault("Dribbles success rate", 40.0), 20.0, 80.0);
        double crosses     = norm(s.getOrDefault("Successful crosses", 0.0)*f90, 0.0, 3.0);
        double shotAcc     = norm(shotAccuracy(s),                             0.0, 60.0);

        return rating  * 0.18
             + goals   * 0.18
             + assist  * 0.14
             + xG      * 0.10
             + xA      * 0.10
             + chances * 0.10
             + dribble * 0.10
             + crosses * 0.06
             + shotAcc * 0.04;
    }

    // ST ─────────────────────────────────────────────────────────────────────
    private double calcST(Map<String, Double> s, double f90) {
        double rating      = norm(s.getOrDefault("Rating", 6.5),          5.5, 8.5);
        double goals       = norm(s.getOrDefault("Goals", 0.0)         * f90, 0.0, 0.70);
        double xG          = norm(s.getOrDefault("xG", 0.0)            * f90, 0.0, 0.65);
        double shotAcc     = norm(shotAccuracy(s),                             0.0, 65.0);
        double assist      = norm(s.getOrDefault("Assists", 0.0)       * f90, 0.0, 0.35);
        double boxTouch    = norm(s.getOrDefault("Touches in opposition box", 0.0)*f90, 0.0, 6.0);
        double aerialPct   = norm(s.getOrDefault("Aerials won %", 35.0),       20.0, 75.0);
        double headers     = norm(s.getOrDefault("Headed shots", 0.0)  * f90, 0.0, 3.0);

        return rating   * 0.18
             + goals    * 0.28
             + xG       * 0.14
             + shotAcc  * 0.10
             + assist   * 0.08
             + boxTouch * 0.08
             + aerialPct* 0.07
             + headers  * 0.07;
    }

    // ── 유틸 ────────────────────────────────────────────────────────────────

    /** stats_json [{title, value}] → Map<title, Double> */
    private Map<String, Double> parseStats(List<Map<String, Object>> stats) {
        Map<String, Double> result = new HashMap<>();
        for (Map<String, Object> entry : stats) {
            if (entry.get("title") == null || entry.get("value") == null) continue;
            String title = entry.get("title").toString();
            try {
                // "3/6" 형태(페널티 선방) → 분자만 사용
                String valStr = entry.get("value").toString().split("/")[0].trim();
                result.put(title, Double.parseDouble(valStr));
            } catch (NumberFormatException ignored) {}
        }
        return result;
    }

    /** 슈팅 정확도(%) = shots on target / shots × 100. 슈팅 0이면 0. */
    private double shotAccuracy(Map<String, Double> s) {
        double shots = s.getOrDefault("Shots", 0.0);
        double sot   = s.getOrDefault("Shots on target", 0.0);
        return shots > 0 ? (sot / shots) * 100.0 : 0.0;
    }

    /** 선형 정규화 [min, max] → [0, 1], 범위 밖은 클램프 */
    private double norm(double v, double min, double max) {
        if (max <= min) return 0.0;
        return Math.max(0.0, Math.min(1.0, (v - min) / (max - min)));
    }

    private int clamp(int v) {
        return Math.max(60, Math.min(99, v));
    }

    /**
     * FotMob 포지션 문자열 → 8개 그룹으로 분류.
     * GK / CB / FB(풀백) / DM / CM / AM / WINGER / ST
     */
    private String positionGroup(String pos) {
        if (pos == null || pos.isBlank()) return "CM";
        String p = pos.toLowerCase();

        if (p.contains("keeper") || p.contains("goalkeeper") || p.equals("gk")) return "GK";

        if (p.contains("center back") || p.contains("centre back")
                || p.equals("cb")) return "CB";

        if (p.contains("back") || p.contains("fullback") || p.contains("full-back")
                || p.contains("left back") || p.contains("right back")
                || p.equals("lb") || p.equals("rb")) return "FB";

        if (p.contains("defensive mid") || p.contains("holding")
                || p.equals("dm") || p.equals("cdm")) return "DM";

        if (p.contains("right wing") || p.contains("left wing")
                || p.contains("winger") || p.equals("lw") || p.equals("rw")) return "WINGER";

        if (p.contains("attacking mid") || p.contains("attacking midfielder")
                || p.contains("second striker") || p.equals("am") || p.equals("cam")) return "AM";

        if (p.contains("striker") || p.contains("forward") || p.contains("centre-forward")
                || p.contains("center forward") || p.equals("st") || p.equals("cf")) return "ST";

        // Central Midfielder, Midfielder 등 나머지
        return "CM";
    }

    // ── 등급 추첨 ───────────────────────────────────────────────────────────

    // ── 주간 오버롤 갱신 ────────────────────────────────────────────────────

    /** 매주 월요일 새벽 3시 — 선수 풀 최신 스탯으로 보유 카드 오버롤 일괄 갱신. */
    @Scheduled(cron = "0 0 3 * * MON")
    @Transactional
    public void weeklyOverallRefresh() {
        log.info("[카드 오버롤 주간 갱신] 시작");
        List<SoccerPlayerDto> pool = getPool();
        if (pool.isEmpty()) { log.warn("[카드 오버롤 주간 갱신] 선수 풀 비어있음"); return; }

        Map<Long, Integer> overallMap = new HashMap<>();
        for (SoccerPlayerDto p : pool) {
            if (p.fotmobId() != null) overallMap.put(p.fotmobId(), p.overall());
        }

        List<PlayerCard> cards = playerCardRepository.findByFotmobPlayerIdIsNotNull();
        int updated = 0;
        for (PlayerCard card : cards) {
            Integer newOverall = overallMap.get(card.getFotmobPlayerId());
            if (newOverall == null) continue;
            if (newOverall.equals(card.getOverall())) {
                // 변동 없어도 delta를 0으로 명시(최초 null에서 0으로 → "유지" 표시)
                if (card.getOverallDelta() == null) card.refreshOverall(newOverall);
                continue;
            }
            card.refreshOverall(newOverall);
            updated++;
        }
        log.info("[카드 오버롤 주간 갱신] 완료 — {}장 변동", updated);
    }

    /** GRADE_CUMULATIVE 누적 확률표로 등급을 추첨. roll 0~999,999 기준. */
    private String rollGrade(Random rng) {
        int roll = rng.nextInt(1_000_000);
        for (int i = 0; i < GRADE_CUMULATIVE.length; i++) {
            if (roll < GRADE_CUMULATIVE[i]) return GRADE_LABELS[i];
        }
        return "아마추어";
    }

    record SoccerPlayerDto(
            String id, String name, String team, String position,
            String nationality, String imageUrl, int overall, Long fotmobId) {}
}
