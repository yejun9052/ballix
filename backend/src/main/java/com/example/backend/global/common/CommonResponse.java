package com.example.backend.global.common;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CommonResponse<T> {
    private boolean success;
    private String msg;
    private T data;

    public static <T> CommonResponse<T> success(String msg, T data) {
        return new CommonResponse<>(true, msg, data);
    }

    public static <T> CommonResponse<T> fail(String msg) {
        return new CommonResponse<>(false, msg, null);
    }

}
