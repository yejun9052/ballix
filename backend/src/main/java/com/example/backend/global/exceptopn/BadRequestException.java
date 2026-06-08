package com.example.backend.global.exceptopn;

import org.springframework.http.HttpStatus;

/** 요청 자체는 인증됐으나 비즈니스 규칙(예측 가능 조건 등)을 위반한 경우. */
public class BadRequestException extends BusinessException {

    public BadRequestException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
