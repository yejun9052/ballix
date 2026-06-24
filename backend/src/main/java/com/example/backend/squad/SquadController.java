package com.example.backend.squad;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 유저 스쿼드(4-2-3-1) 조회/저장 — 로그인 필요(@AuthenticationPrincipal Long userId).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/squad")
public class SquadController {

    private final SquadService squadService;

    /** 내 스쿼드 조회. */
    @GetMapping
    public ResponseEntity<CommonResponse<?>> mySquad(@AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok(
                CommonResponse.success("스쿼드 조회 성공", squadService.getMySquad(userId)));
    }

    /** 내 스쿼드 저장(통째 교체). 본문: { "slots": { "GK": 12, "ST": 34, ... } }. */
    @PutMapping
    public ResponseEntity<CommonResponse<?>> save(
            @AuthenticationPrincipal Long userId,
            @RequestBody SquadSaveRequest req) {
        return ResponseEntity.ok(
                CommonResponse.success("스쿼드 저장 성공", squadService.saveMySquad(userId, req.slots())));
    }

    public record SquadSaveRequest(Map<String, Long> slots) {}
}
