package com.example.backend.squad;

import com.example.backend.global.exceptopn.BadRequestException;
import com.example.backend.global.exceptopn.UnauthorizedException;
import com.example.backend.playercard.PlayerCardService;
import com.example.backend.playercard.PlayerCardView;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 유저별 스쿼드(4-2-3-1 고정) 조회/저장.
 * 포지션·소유 검증은 {@link PlayerCardService#myCards}(소유 카드 + 포지션 보완)를 재사용한다.
 * 규칙: 슬롯엔 본인 소유 카드만, 같은 카드 중복 배치 금지, <b>골키퍼 자리(GK)엔 골키퍼만</b>(반대도 금지).
 */
@Service
@RequiredArgsConstructor
public class SquadService {

    private final SquadRepository squadRepository;
    private final PlayerCardService playerCardService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    static final String FORMATION = "4-2-3-1";
    static final String GK_SLOT = "GK";
    /** 4-2-3-1 슬롯 키(GK / 백4 / 중앙2 / 공격3 / 최전방1). */
    static final List<String> SLOTS =
            List.of("GK", "LB", "LCB", "RCB", "RB", "LCM", "RCM", "LW", "CAM", "RW", "ST");
    private static final Set<String> SLOT_SET = new HashSet<>(SLOTS);

    @Transactional(readOnly = true)
    public SquadView getMySquad(Long userId) {
        notLogin(userId);
        Map<Long, PlayerCardView> owned = ownedById(userId);
        Map<String, Long> raw = squadRepository.findByOwnerId(userId)
                .map(s -> parse(s.getSlotsJson()))
                .orElseGet(Map::of);

        Map<String, PlayerCardView> slots = new LinkedHashMap<>();
        for (String slot : SLOTS) {
            Long cardId = raw.get(slot);
            if (cardId != null && owned.containsKey(cardId)) {
                slots.put(slot, owned.get(cardId));   // 더 이상 소유하지 않은 카드는 자동 제외
            }
        }
        return new SquadView(FORMATION, SLOTS, slots);
    }

    @Transactional
    public SquadView saveMySquad(Long userId, Map<String, Long> rawSlots) {
        notLogin(userId);
        Map<Long, PlayerCardView> owned = ownedById(userId);

        Map<String, Long> clean = new LinkedHashMap<>();
        Set<Long> used = new HashSet<>();
        if (rawSlots != null) {
            for (Map.Entry<String, Long> e : rawSlots.entrySet()) {
                String slot = e.getKey();
                Long cardId = e.getValue();
                if (cardId == null) {
                    continue;   // 빈 슬롯
                }
                if (!SLOT_SET.contains(slot)) {
                    throw new BadRequestException("알 수 없는 포지션 슬롯: " + slot);
                }
                PlayerCardView card = owned.get(cardId);
                if (card == null) {
                    throw new BadRequestException("보유하지 않은 카드입니다 (id=" + cardId + ").");
                }
                if (!used.add(cardId)) {
                    throw new BadRequestException("같은 카드를 여러 자리에 넣을 수 없습니다.");
                }
                boolean gkCard = isGoalkeeper(card.position());
                boolean gkSlot = GK_SLOT.equals(slot);
                if (gkSlot && !gkCard) {
                    throw new BadRequestException("골키퍼 자리에는 골키퍼만 넣을 수 있습니다.");
                }
                if (!gkSlot && gkCard) {
                    throw new BadRequestException("골키퍼는 골키퍼 자리에만 넣을 수 있습니다.");
                }
                clean.put(slot, cardId);
            }
        }

        Squad squad = squadRepository.findByOwnerId(userId)
                .orElseGet(() -> Squad.create(userId, null));
        squad.updateSlots(toJson(clean));
        squadRepository.save(squad);
        return getMySquad(userId);
    }

    // ── 내부 ─────────────────────────────────────────────
    /** 소유 카드 id→뷰(포지션 보완된 값). 소유 검증 + GK 판정에 사용. */
    private Map<Long, PlayerCardView> ownedById(Long userId) {
        Map<Long, PlayerCardView> map = new HashMap<>();
        for (PlayerCardView c : playerCardService.myCards(userId)) {
            map.put(c.id(), c);
        }
        return map;
    }

    private boolean isGoalkeeper(String pos) {
        if (pos == null) return false;
        String p = pos.toLowerCase();
        return p.contains("keeper") || p.equals("gk");
    }

    private Map<String, Long> parse(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Long>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String toJson(Map<String, Long> m) {
        try {
            return objectMapper.writeValueAsString(m);
        } catch (Exception e) {
            throw new BadRequestException("스쿼드 저장에 실패했습니다.");
        }
    }

    private void notLogin(Long userId) {
        if (userId == null) {
            throw new UnauthorizedException("로그인이 필요합니다.");
        }
    }
}
