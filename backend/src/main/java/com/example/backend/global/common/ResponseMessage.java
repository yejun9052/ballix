package com.example.backend.global.common;

/**
 * API 공통 응답 메시지 상수.
 * 컨트롤러에서 {@link CommonResponse#success}/{@link CommonResponse#fail}에 문자열 리터럴 대신 이 상수를 쓴다
 * — 문구를 한 곳에서 관리(단일 출처)하고 오타·중복을 막는다.
 * (카운트 등 동적 값이 섞인 메시지는 그대로 인라인으로 둔다.)
 */
public final class ResponseMessage {

    private ResponseMessage() {}

    // ── 공통 조회 ──
    public static final String READ_SUCCESS = "조회 성공";
    public static final String DATA_READ_SUCCESS = "데이터 조회 성공";

    // ── 인증 / 회원 ──
    public static final String SIGNUP_SUCCESS = "성공적으로 회원이 등록되었습니다.";
    public static final String LOGOUT_SUCCESS = "로그아웃 성공";
    public static final String NICKNAME_CHANGE_SUCCESS = "닉네임 변경 성공";

    // ── 댓글 ──
    public static final String COMMENT_CREATE_SUCCESS = "댓글 작성 성공";
    public static final String COMMENT_DELETE_SUCCESS = "댓글 삭제 성공";

    // ── FotMob 동기화 / 순위 / 개인기록 ──
    public static final String SYNC_DONE = "동기화 완료";
    public static final String STANDINGS_READ_SUCCESS = "순위 조회 성공";
    public static final String STANDINGS_REFRESH_DONE = "순위 갱신 완료";
    public static final String PLAYER_STATS_READ_SUCCESS = "개인 기록 조회 성공";
    public static final String PLAYER_STATS_REFRESH_DONE = "개인 기록 갱신 완료";
    public static final String POLL_INTERVAL_CHANGED = "폴링 주기 변경";
    public static final String PREVIEW_SUCCESS = "미리보기 성공";
    public static final String SEARCH_SUCCESS = "검색 성공";
    public static final String PLAYER_READ_SUCCESS = "선수 조회 성공";

    // ── AI ──
    public static final String AI_PREDICT_DONE = "AI 승률 예측 완료";

    // ── 경기 다시보기 ──
    public static final String REPLAY_SET = "다시보기 등록";
    public static final String REPLAY_CLEARED = "다시보기 해제";

    // ── 공지 ──
    public static final String NOTICE_CREATED = "공지 등록";
    public static final String NOTICE_UPDATED = "공지 수정";
    public static final String NOTICE_DELETED = "공지 삭제";

    // ── 선수카드 / 스쿼드 ──
    public static final String DRAW_SUCCESS = "뽑기 성공";
    public static final String MY_CARDS_READ_SUCCESS = "내 카드 조회 성공";
    public static final String SQUAD_READ_SUCCESS = "스쿼드 조회 성공";
    public static final String SQUAD_SAVE_SUCCESS = "스쿼드 저장 성공";

    // ── 예측 ──
    public static final String PREDICT_SUCCESS = "예측 성공";

    // ── 유저 관리(관리자) ──
    public static final String ROLE_CHANGED = "권한 변경";
    public static final String ACCOUNT_STATUS_CHANGED = "계정상태 변경";

    // ── 에러(공통) ──
    public static final String FORBIDDEN = "접근 권한이 없습니다.";
    public static final String REQUEST_FAILED = "요청을 처리할 수 없습니다.";
}
