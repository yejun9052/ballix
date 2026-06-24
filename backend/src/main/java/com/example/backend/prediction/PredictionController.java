package com.example.backend.prediction;

import com.example.backend.global.common.CommonResponse;
import com.example.backend.global.common.ResponseMessage;
import com.example.backend.prediction.enums.Winner;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/prediction")
public class PredictionController {

    private final PredictionRepository predictionRepository;
    private final PredictionService predictionService;

    // 예측하기 (로그인 필요) - 이미 했으면 수정
    @PostMapping("/predict")
    public ResponseEntity<CommonResponse<?>> predict(
            @AuthenticationPrincipal Long userId,
            @RequestParam Long matchId,
            @RequestParam Winner predictedWinner) {
        return ResponseEntity
                .ok(CommonResponse.success(ResponseMessage.PREDICT_SUCCESS, predictionService.predict(userId, matchId, predictedWinner)));
    }

    // 내 예측 전부 조회 (페이지당 8개)
    @GetMapping("/myPrediction")
    public ResponseEntity<CommonResponse<?>> myPrediction(
            @AuthenticationPrincipal Long userId,
            @PageableDefault(size = 8) Pageable pageable) {
        return ResponseEntity
                .ok(CommonResponse.success(ResponseMessage.DATA_READ_SUCCESS, predictionService.myPrediction(userId, pageable)));
    }

    // 특정 경기에 대한 내 예측 조회
    @GetMapping("/findByMatch")
    public ResponseEntity<CommonResponse<?>> findByMatch(
            @AuthenticationPrincipal Long userId,
            @RequestParam Long matchId) {
        return ResponseEntity
                .ok(CommonResponse.success(ResponseMessage.DATA_READ_SUCCESS, predictionService.findByMatch(userId, matchId)));
    }
    // 예측 분포(%) 조회 - 본인이 예측한 경기만
    @GetMapping("/ratio")
    public ResponseEntity<CommonResponse<?>> ratio(
            @AuthenticationPrincipal Long userId,
            @RequestParam Long matchId) {
        return ResponseEntity
                .ok(CommonResponse.success(ResponseMessage.DATA_READ_SUCCESS, predictionService.getRatio(userId, matchId)));
    }

}
