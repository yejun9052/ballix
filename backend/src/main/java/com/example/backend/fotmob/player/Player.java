package com.example.backend.fotmob.player;

import com.example.backend.global.common.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * FotMob 선수 1명. fotmobPlayerId로 식별/업서트한다(Team과 동일 패턴).
 * <p>
 * 식별·소속팀 정보는 라인업 동기화 시 채워지고(updateBasic), 상세(프로필+시즌 스탯)는
 * 선수 모달 첫 조회 시 1회 크롤해 채운다(updateDetail) — DB-first lazy-cache.
 * 가변 목록인 info/stats는 JSON 문자열로 보관한다.
 */
@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "player")
public class Player extends BaseTimeEntity {

    /** FotMob 선수 ID. 이 값으로 선수를 식별/업서트한다. */
    @Column(name = "fotmob_player_id", unique = true, nullable = false)
    private Long fotmobPlayerId;

    @Column(nullable = false)
    private String name;

    /** 소속팀(FotMob 팀 ID/이름/엠블럼). 라인업 동기화 시 경기 홈/원정 팀에서 채운다. */
    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "team_name")
    private String teamName;

    @Column(name = "team_crest")
    private String teamCrest;

    /** 주 포지션 라벨(상세 크롤 시 채움). */
    @Column
    private String position;

    @Column
    private Boolean onLoan;

    @Column(name = "league_name")
    private String leagueName;

    @Column
    private String season;

    /** FotmobPlayerResponse.Info 리스트(프로필 항목)를 JSON으로 저장. */
    @Column(name = "info_json", columnDefinition = "TEXT")
    private String infoJson;

    /** FotmobPlayerResponse.Stat 리스트(시즌 스탯)를 JSON으로 저장. */
    @Column(name = "stats_json", columnDefinition = "TEXT")
    private String statsJson;

    /** 상세(프로필+스탯) 마지막 수집 시각. null=상세 미수집(지연 캐시 판단용). */
    @Column(name = "detail_fetched_at")
    private LocalDateTime detailFetchedAt;

    /** 동기화 시 식별·소속 갱신(상세는 건드리지 않음). */
    public void updateBasic(String name, Long teamId, String teamName, String teamCrest) {
        if (name != null && !name.isBlank()) this.name = name;
        if (teamId != null) this.teamId = teamId;
        if (teamName != null && !teamName.isBlank()) this.teamName = teamName;
        if (teamCrest != null && !teamCrest.isBlank()) this.teamCrest = teamCrest;
    }

    /** 상세(프로필+시즌 스탯) 반영 + 수집 시각 갱신. */
    public void updateDetail(String name, Long teamId, String teamName, String teamCrest,
                             String position, Boolean onLoan, String leagueName, String season,
                             String infoJson, String statsJson) {
        updateBasic(name, teamId, teamName, teamCrest);
        if (position != null) this.position = position;
        if (onLoan != null) this.onLoan = onLoan;
        if (leagueName != null) this.leagueName = leagueName;
        if (season != null) this.season = season;
        this.infoJson = infoJson;
        this.statsJson = statsJson;
        this.detailFetchedAt = LocalDateTime.now();
    }
}
