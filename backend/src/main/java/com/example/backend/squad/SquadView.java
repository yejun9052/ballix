package com.example.backend.squad;

import com.example.backend.playercard.PlayerCardView;

import java.util.List;
import java.util.Map;

/**
 * 스쿼드 응답 — 포메이션·슬롯 순서 + 채워진 슬롯만(slotKey→카드).
 * 빈 슬롯은 slots 맵에서 빠진다(프론트가 slotKeys 레이아웃을 보고 빈칸으로 렌더).
 */
public record SquadView(
        String formation,                       // "4-2-3-1"
        List<String> slotKeys,                  // 슬롯 키 순서(GK..ST)
        Map<String, PlayerCardView> slots       // 채워진 슬롯만
) {}
