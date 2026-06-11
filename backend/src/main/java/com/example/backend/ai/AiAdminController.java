package com.example.backend.ai;

import com.example.backend.global.common.CommonResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 관리자용 AI 트리거. 관리자가 경기를 체크해서 올리면 그 경기만 승률을 예측한다.
 * 예측된 경기는 predictionEnabled=true가 되어 경기 목록 최상단으로 올라간다.
 * 관리자 판별은 다른 관리자 컨트롤러와 동일하게 ROLE_ADMIN_USER로 통일.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/ai")
public class AiAdminController {

    private final AiPredictionService predictionService;

    /** 경기 1건을 AI 승률 예측 대상으로 선택 + 즉시 예측 생성. force=true면 재생성. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/predict")
    public ResponseEntity<CommonResponse<?>> predict(
            @RequestParam Long matchId,
            @RequestParam(defaultValue = "false") boolean force) {
        return ResponseEntity.ok(
                CommonResponse.success("AI 승률 예측 완료", predictionService.predict(matchId, force)));
    }
}
