package com.example.backend.squad;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 유저별 스쿼드(4-2-3-1 고정). 슬롯→보유 카드 매핑을 JSON({"GK":12,"LB":34,...})으로 보관한다.
 * 유저당 1개(owner_id unique) — 저장 시 통째로 교체(upsert).
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "squads")
public class Squad extends BaseTimeEntity {

    /** 소유 유저 — 유저당 1개. */
    @Column(name = "owner_id", nullable = false, unique = true)
    private Long ownerId;

    /** 슬롯키→PlayerCard.id 매핑 JSON. 빈 슬롯은 키 자체가 없다. */
    @Column(name = "slots_json", columnDefinition = "TEXT")
    private String slotsJson;

    public static Squad create(Long ownerId, String slotsJson) {
        return Squad.builder().ownerId(ownerId).slotsJson(slotsJson).build();
    }

    public void updateSlots(String slotsJson) {
        this.slotsJson = slotsJson;
    }
}
