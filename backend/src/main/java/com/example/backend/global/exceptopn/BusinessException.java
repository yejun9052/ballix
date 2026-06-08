package com.example.backend.global.exceptopn;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 서비스 계층 검증 실패의 공통 부모.
 * GlobalExceptionHandler 가 {@link #status} 와 메시지로 CommonResponse.fail JSON 을 만든다.
 * (raw RuntimeException 대신 이 타입을 던져서 의미와 HTTP 상태를 명시한다)
 */
@Getter
public class BusinessException extends RuntimeException {

    private final HttpStatus status;

    public BusinessException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }
}
