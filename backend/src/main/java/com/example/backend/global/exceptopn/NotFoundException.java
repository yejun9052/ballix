package com.example.backend.global.exceptopn;

import org.springframework.http.HttpStatus;

/** 조회 대상(유저·경기·예측 등)이 존재하지 않는 경우. */
public class NotFoundException extends BusinessException {

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, message);
    }
}
