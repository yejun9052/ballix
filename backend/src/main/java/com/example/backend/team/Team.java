package com.example.backend.team;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "teams")
public class Team extends BaseTimeEntity {

    /** FotMob 팀 ID. 이 값으로 팀을 식별/업서트한다. */
    @Column(name = "fotmob_team_id", unique = true)
    private Long fotmobTeamId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String shortName;

    @Column(nullable = false)
    private String tla;

    /** 엠블럼(로고) URL. */
    @Column(nullable = false)
    private String crest;

    /** 동기화 시 이름/엠블럼 갱신. */
    public void updateInfo(String name, String crest) {
        if (name != null && !name.isBlank()) this.name = name;
        if (crest != null && !crest.isBlank()) this.crest = crest;
    }
}
