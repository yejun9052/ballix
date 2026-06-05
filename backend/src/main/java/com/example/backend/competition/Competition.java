package com.example.backend.competition;

import com.example.backend.competition.enums.CompType;
import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "competitions")
public class Competition extends BaseTimeEntity {

    /** FotMob 리그 ID (예: 월드컵=77). 이 값으로 식별/업서트. */
    @Column(name = "fotmob_league_id", unique = true)
    private Long fotmobLeagueId;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CompType type;

    @Column(nullable = false)
    private String emblem;

    public void updateInfo(String name, String emblem) {
        if (name != null && !name.isBlank()) this.name = name;
        if (emblem != null && !emblem.isBlank()) this.emblem = emblem;
    }
}
