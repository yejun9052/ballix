package com.example.backend.ai;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

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
    private final AiLivePredictionScheduler liveScheduler;

    /** 경기 1건을 AI 승률 예측 대상으로 선택 + 즉시 예측 생성. force=true면 재생성. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/predict")
    public ResponseEntity<CommonResponse<?>> predict(
            @RequestParam Long matchId,
            @RequestParam(defaultValue = "false") boolean force) {
        return ResponseEntity.ok(
                CommonResponse.success(ResponseMessage.AI_PREDICT_DONE, predictionService.predict(matchId, force)));
    }

    /** 실시간 AI 승률 갱신(15분 간격) 상태 조회 — 공개. enabled/간격/현재 대상 경기 수. */
    @GetMapping("/live-prediction")
    public ResponseEntity<CommonResponse<?>> getLivePrediction() {
        return ResponseEntity.ok(CommonResponse.success(ResponseMessage.READ_SUCCESS, Map.of(
                "enabled", liveScheduler.isEnabled(),
                "intervalMinutes", liveScheduler.getIntervalMinutes(),
                "liveTargets", liveScheduler.countLiveTargets())));
    }

    /** 실시간 AI 승률 갱신 on/off 런타임 토글(관리자). ?enabled=true|false. 재시작 시 설정값으로 초기화. */
    @PreAuthorize("hasRole('ADMIN_USER')")
    @PostMapping("/live-prediction")
    public ResponseEntity<CommonResponse<?>> setLivePrediction(@RequestParam boolean enabled) {
        liveScheduler.setEnabled(enabled);
        return ResponseEntity.ok(CommonResponse.success(
                "실시간 AI 예측 " + (enabled ? "켜짐" : "꺼짐"), liveScheduler.isEnabled()));
    }
}
