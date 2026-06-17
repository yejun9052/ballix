package com.example.backend.fotmob.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * Python FotMob API의 GET /player/{id} 응답 — 선수 프로필 + 주 리그 시즌 스탯.
 * DB에 저장하지 않고 프록시로 그대로 내려준다(선수 사진은 프론트가 id로 직접 구성).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FotmobPlayerResponse(
        Long id,
        String name,
        Long teamId,
        String teamName,
        String teamCrest,
        Boolean onLoan,
        String position,
        String photo,
        String leagueName,
        String season,
        List<Info> info,
        List<Stat> stats
) {

    /** 프로필 항목(나이·키·국적·등번호·주발·시장가치 등). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Info(String label, String value) {}

    /** 시즌 스탯(출전·골·도움·평점 등). value는 숫자/문자 혼재라 Object. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Stat(String title, Object value) {}
}
