package com.example.backend.global.exceptopn;

import com.example.backend.global.common.CommonResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * 서비스에서 던진 예외를 JSON(CommonResponse.fail)으로 변환한다.
 * 핸들러가 없으면 RuntimeException → 500 → /error 포워드 → (보안상 미허용) → OAuth 리다이렉트로 둔갑한다.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // @RequestParam 타입 변환 실패 (예: predictedWinner 에 잘못된 enum 값)
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<CommonResponse<?>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        return ResponseEntity
                .badRequest()
                .body(CommonResponse.fail("요청 값이 올바르지 않습니다. (" + e.getName() + ")"));
    }

    // 서비스 검증 실패 — 커스텀 예외(상태코드를 스스로 안다)
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<CommonResponse<?>> handleBusiness(BusinessException e) {
        return ResponseEntity
                .status(e.getStatus())
                .body(CommonResponse.fail(e.getMessage()));
    }

    // 그 외 예기치 못한 RuntimeException (500 → /error 포워드 방지용 안전망)
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<CommonResponse<?>> handleRuntime(RuntimeException e) {
        log.error("[error] 예기치 않은 오류: {}", e.getMessage(), e);
        return ResponseEntity
                .badRequest()
                .body(CommonResponse.fail("요청을 처리할 수 없습니다."));
    }
}
