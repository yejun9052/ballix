package com.example.backend.global.exceptopn;

import org.springframework.http.HttpStatus;

/** 로그인이 필요한 요청을 비로그인으로 호출한 경우. */
public class UnauthorizedException extends BusinessException {

    public UnauthorizedException(String message) {
        super(HttpStatus.UNAUTHORIZED, message);
    }
}
