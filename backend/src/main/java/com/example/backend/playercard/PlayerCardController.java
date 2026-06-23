package com.example.backend.playercard;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/playercard")
public class PlayerCardController {

    private final PlayerCardService playerCardService;

    // 카드 뽑기 — count=1 or 10 (로그인 필요)
    @PostMapping("/draw")
    public ResponseEntity<CommonResponse<?>> draw(
            @AuthenticationPrincipal Long userId,
            @RequestParam(defaultValue = "1") int count
    ) {
        List<PlayerCardView> cards = playerCardService.draw(userId, count);
        return ResponseEntity.ok(CommonResponse.success("뽑기 성공", cards));
    }

    // 내 카드 목록 (로그인 필요)
    @GetMapping("/my")
    public ResponseEntity<CommonResponse<?>> myCards(
            @AuthenticationPrincipal Long userId
    ) {
        List<PlayerCardView> cards = playerCardService.myCards(userId);
        return ResponseEntity.ok(CommonResponse.success("내 카드 조회 성공", cards));
    }
}
