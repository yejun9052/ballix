package com.example.backend.user;

/**
 * 리더보드에 참가하는 가상 "AI" 유저 계정 식별값.
 * AI는 관리자가 생성한 경기별 AI 승률에서 '가장 높은 결과'를 찍은 것으로 자동 참가하고,
 * 경기 종료 시 일반 유저와 동일하게 채점돼 누적 포인트로 리더보드에 노출된다.
 * (로그인하지 않는 시스템 계정 — 이 이메일로 OAuth 가입은 불가능하게 예약된 도메인을 쓴다.)
 */
public final class AiAccount {

    private AiAccount() {}

    /** AI 시스템 계정 식별 이메일(예약). 실제 로그인엔 쓰이지 않는다. */
    public static final String EMAIL = "ai-bot@ballix.local";

    /** 리더보드 표시 이름. */
    public static final String NAME = "AI";

    /** 주어진 유저가 AI 시스템 계정인지. */
    public static boolean is(User user) {
        return user != null && EMAIL.equals(user.getEmail());
    }
}
