package com.example.backend.playercard;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.user.User;
import com.example.backend.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlayerCardService {

    private final PlayerCardRepository playerCardRepository;
    private final UserRepository userRepository;
    private final RestClient restClient = RestClient.create();

    // TheSportsDB 무료 테스트 키 (키 불필요, 엔드포인트에 /3/ 포함)
    private static final String API = "https://www.thesportsdb.com/api/v1/json/3";

    // 명문 클럽 목록 — 포켓카드와 동일
    private static final List<String> TEAMS = List.of(
        "Arsenal", "Manchester City", "Liverpool", "Manchester United", "Chelsea",
        "Tottenham", "Real Madrid", "Barcelona", "Bayern Munich", "Paris Saint-Germain",
        "Juventus", "AC Milan", "Inter Milan", "Borussia Dortmund", "Atletico Madrid"
    );

    // in-process 캐시 (24시간)
    private List<SoccerPlayerDto> cachedPool = null;
    private long cachedAt = 0;
    private static final long TTL_MS = 24 * 60 * 60 * 1000L;

    // ── 뽑기 ────────────────────────────────────────────────────────

    @Transactional
    public List<PlayerCardView> draw(Long userId, int count) {
        if (userId == null) throw new UnauthorizedException("로그인이 필요합니다.");
        if (count != 1 && count != 10) throw new BadRequestException("count는 1 또는 10만 가능합니다.");

        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("유저를 찾을 수 없습니다."));

        List<SoccerPlayerDto> pool = getPool();
        if (pool.isEmpty()) throw new BadRequestException("선수 데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");

        List<SoccerPlayerDto> drawn = weightedDraw(pool, count);

        // DB 저장 후 뷰로 변환
        List<PlayerCardView> result = new ArrayList<>();
        for (SoccerPlayerDto p : drawn) {
            PlayerCard card = PlayerCard.create(
                    owner, p.name(), p.nationality(), p.overall(), p.position(), p.team(), p.imageUrl()
            );
            PlayerCard saved = playerCardRepository.save(card);
            result.add(PlayerCardView.from(saved));
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

    // ── 선수 풀 ─────────────────────────────────────────────────────

    private synchronized List<SoccerPlayerDto> getPool() {
        if (cachedPool != null && System.currentTimeMillis() - cachedAt < TTL_MS) return cachedPool;
        try {
            cachedPool = buildPool();
            cachedAt = System.currentTimeMillis();
        } catch (Exception e) {
            log.warn("TheSportsDB 선수 풀 빌드 실패: {}", e.getMessage());
            if (cachedPool == null) cachedPool = List.of();
        }
        return cachedPool;
    }

    @SuppressWarnings("unchecked")
    private List<SoccerPlayerDto> buildPool() {
        List<SoccerPlayerDto> pool = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (String teamName : TEAMS) {
            try {
                // 팀 ID 조회
                Map<?, ?> searchRes = restClient.get()
                        .uri(API + "/searchteams.php?t=" + encode(teamName))
                        .retrieve().body(Map.class);
                String teamId = extractTeamId(searchRes);
                if (teamId == null) continue;

                // 선수 목록 조회
                Map<?, ?> playersRes = restClient.get()
                        .uri(API + "/lookup_all_players.php?id=" + teamId)
                        .retrieve().body(Map.class);

                List<?> players = (List<?>) ((Map<?, ?>) playersRes).get("player");
                if (players == null) continue;

                for (Object raw : players) {
                    Map<?, ?> p = (Map<?, ?>) raw;
                    String id = str(p, "idPlayer");
                    String name = str(p, "strPlayer");
                    String pos = str(p, "strPosition");
                    if (id == null || name == null || seen.contains(id) || !isPlayer(pos)) continue;
                    seen.add(id);

                    int overall = deriveOverall(id);
                    String imageUrl = str(p, "strCutout");
                    if (imageUrl == null) imageUrl = str(p, "strThumb");

                    pool.add(new SoccerPlayerDto(
                            id, name,
                            str(p, "strTeam") != null ? str(p, "strTeam") : teamName,
                            pos != null ? pos : "",
                            str(p, "strNationality") != null ? str(p, "strNationality") : "",
                            imageUrl,
                            overall
                    ));
                }
            } catch (Exception e) {
                log.debug("TheSportsDB 팀 {} 스킵: {}", teamName, e.getMessage());
            }
        }
        return pool;
    }

    // 가중치 뽑기 — 오버롤 높을수록 드물게
    private List<SoccerPlayerDto> weightedDraw(List<SoccerPlayerDto> pool, int count) {
        List<SoccerPlayerDto> weighted = new ArrayList<>();
        for (SoccerPlayerDto p : pool) {
            int w = p.overall() >= 90 ? 1 : p.overall() >= 82 ? 3 : 6;
            for (int i = 0; i < w; i++) weighted.add(p);
        }

        Set<String> picked = new HashSet<>();
        List<SoccerPlayerDto> result = new ArrayList<>();
        int max = Math.min(count, pool.size());
        Random rng = new Random();
        int guard = 0;

        while (result.size() < max && guard < max * 200) {
            guard++;
            SoccerPlayerDto c = weighted.get(rng.nextInt(weighted.size()));
            if (picked.contains(c.id())) continue;
            picked.add(c.id());
            result.add(c);
        }
        return result;
    }

    // ── 유틸 ────────────────────────────────────────────────────────

    // 선수 id 해시로 60~99 오버롤 생성 (TheSportsDB는 오버롤 미제공)
    private int deriveOverall(String seed) {
        int h = 0;
        for (char c : seed.toCharArray()) h = h * 31 + c;
        return 60 + (Math.abs(h) % 40);
    }

    private boolean isPlayer(String pos) {
        if (pos == null || pos.isBlank()) return false;
        String lower = pos.toLowerCase();
        return !lower.matches(".*(coach|manager|assistant|staff|physio).*");
    }

    @SuppressWarnings("unchecked")
    private String extractTeamId(Map<?, ?> res) {
        if (res == null) return null;
        List<?> teams = (List<?>) res.get("teams");
        if (teams == null || teams.isEmpty()) return null;
        for (Object t : teams) {
            Map<?, ?> team = (Map<?, ?>) t;
            if ("Soccer".equals(team.get("strSport"))) return str(team, "idTeam");
        }
        return str((Map<?, ?>) teams.get(0), "idTeam");
    }

    private String str(Map<?, ?> map, String key) {
        Object v = map.get(key);
        if (v == null || "null".equals(v.toString()) || v.toString().isBlank()) return null;
        return v.toString();
    }

    private String encode(String s) {
        return s.replace(" ", "%20");
    }

    // 내부 DTO (캐시 전용)
    record SoccerPlayerDto(
            String id, String name, String team, String position,
            String nationality, String imageUrl, int overall) {}
}
