package com.example.backend.fotmob.player;

import com.example.backend.fotmob.dto.FotmobPlayerResponse;
import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 선수 시즌 조회 — 경기/실시간 라인업과 무관하게 선수의 프로필 + 시즌 스탯만 반환한다.
 * (경기별 스탯은 라인업 응답에 이미 있으므로 여기서 다루지 않는다.)
 * DB-first lazy-cache: 없으면 1회 크롤·저장 후 이후엔 DB에서 읽는다({@link PlayerService}).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/player")
public class PlayerController {

    private final PlayerService playerService;

    /** 선수 시즌 상세(프로필 + 시즌 스탯) — fotmobPlayerId로 조회(공개). */
    @GetMapping("/{playerId}")
    public ResponseEntity<CommonResponse<?>> player(@PathVariable Long playerId) {
        FotmobPlayerResponse data = playerService.getOrFetch(playerId);
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.PLAYER_READ_SUCCESS, data));
    }
}
