package com.example.backend.playercard;

/**
 * 선수 카드 등급 — 오버롤(overall)로 자동 산출.
 * 경계는 하한 포함·상한 미만(예: 월드클래스 = 80 이상 90 미만, 레전드 = 90 이상)으로 일관 처리한다.
 *   ~59     : 아마추어
 *   60~64   : 세미프로
 *   65~69   : 프로
 *   70~79   : 탑 클래스
 *   80~89   : 월드클래스
 *   90~     : 레전드
 */
public enum Grade {
    AMATEUR("아마추어"),
    SEMI_PRO("세미프로"),
    PRO("프로"),
    TOP_CLASS("탑 클래스"),
    WORLD_CLASS("월드클래스"),
    LEGEND("레전드");

    private final String label;

    Grade(String label) {
        this.label = label;
    }

    /** 한글 표기(컬럼에 저장되는 값). */
    public String getLabel() {
        return label;
    }

    /** 오버롤로 등급 산출. overall이 null이면 null 반환. */
    public static Grade fromOverall(Integer overall) {
        if (overall == null) return null;
        if (overall < 60) return AMATEUR;
        if (overall < 65) return SEMI_PRO;
        if (overall < 70) return PRO;
        if (overall < 80) return TOP_CLASS;
        if (overall < 90) return WORLD_CLASS;
        return LEGEND;
    }

    /** 오버롤로 등급 한글 라벨 산출(저장용). overall이 null이면 null. */
    public static String labelOf(Integer overall) {
        Grade g = fromOverall(overall);
        return g == null ? null : g.label;
    }
}
