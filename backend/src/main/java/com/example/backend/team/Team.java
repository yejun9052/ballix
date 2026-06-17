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

    /** 원본(번역 전) 팀/나라 이름 — FotMob 영문 표기. */
    @Column(nullable = false)
    private String name;

    /** 번역 후 한국어 이름(나라/팀명). 크롤 시 Gemini가 채운다. 아직 번역 전이면 null. */
    @Column(name = "name_ko")
    private String nameKo;

    @Column(nullable = false)
    private String shortName;

    @Column(nullable = false)
    private String tla;

    /** 엠블럼(로고) URL. */
    @Column(nullable = false)
    private String crest;

    /** 동기화 시 이름/엠블럼 갱신. 원본 이름이 바뀌면(예: 토너먼트 미정→실제 팀) 한국어 번역을 비워 재번역 대상으로 둔다. */
    public void updateInfo(String name, String crest) {
        if (name != null && !name.isBlank()) {
            if (!name.equals(this.name)) this.nameKo = null;
            this.name = name;
        }
        if (crest != null && !crest.isBlank()) this.crest = crest;
    }

    /** 번역 후 한국어 이름 반영. */
    public void updateKoName(String nameKo) {
        if (nameKo != null && !nameKo.isBlank()) this.nameKo = nameKo;
    }
}
