package com.example.backend.fotmob.lineup;

/**
 * FotMob 라인업의 {@code positionId}(그리드 코드)와 좌표에서 사람이 읽는 세부 포지션 라벨
 * (GK·LB·CB·RB·LM·CM·RM·LW·CAM·RW·ST 등)을 파생한다.
 *
 * <p><b>핵심:</b> FotMob {@code positionId}의 십의 자리가 라인(깊이)을 <b>포메이션과 무관하게</b> 고정으로 알려준다 —
 * 관측: GK=11, 수비=3x(32~38), 중앙/수비형 미드=6x·7x(62~79), 공격형 미드=8x(84·86), 최전방=10x·11x(105·115).
 * 반면 피치 좌표 {@code posX}(깊이)는 <b>라인 개수에 따라 간격이 달라져서</b>(예: 4라인이면 0.10/0.36/0.61/0.87,
 * 5라인이면 0.10/0.29/0.49/0.68/0.87) 고정 임계값으로 라인을 나누면 오분류가 난다
 * (4-5-1의 중앙 미드가 x≈0.61로 "공격형 미드" 밴드에 빠져 CAM/ST로 잘못 표기되던 버그). 그래서 라인은 {@code positionId}로 정한다.
 *
 * <p>좌우(L/C/R)는 {@code posY}로 정한다. FotMob posY는 홈팀 관점 절대좌표라 어웨이팀은 미러(1-y)해
 * 팀 기준 좌우로 바꾼다(프론트 배치도 {@code Pitch}의 미러 규약과 동일 → 라벨이 배치도 위치와 일치).
 * 팀 기준 t&lt;0.34=왼쪽(L), t&gt;0.66=오른쪽(R), 그 사이=중앙(C).
 *
 * <p>{@code positionId}가 없을 때만(라인업 미확정 등) {@code posX} 깊이 임계값으로 폴백한다.
 */
public final class PositionResolver {

    private PositionResolver() {}

    /**
     * @param positionId FotMob 그리드 포지션 코드(11=GK, 3x=DF, 6x/7x=MF, 8x=AM, 10x+=FW). 라인 판정의 1순위.
     * @param posX       깊이 0~1(0=자기 GK쪽). positionId 없을 때의 폴백에만 사용.
     * @param posY       좌우 0~1(홈팀 관점 절대좌표).
     * @param home       true=홈팀(posY 그대로), false=원정팀(posY 미러).
     * @return 세부 포지션 라벨. 정보가 전혀 없으면 null.
     */
    public static String resolve(Integer positionId, Double posX, Double posY, boolean home) {
        String band = bandFromPositionId(positionId);   // 1순위: positionId(라인 개수와 무관하게 정확)
        if (band == null) band = bandFromPosX(posX);     // 폴백: 좌표 깊이
        if (band == null) return coarseFromPositionId(positionId);

        char lat = lateral(posY, home);
        return switch (band) {
            case "GK" -> "GK";
            case "DEF" -> side(lat, "LB", "CB", "RB");    // 수비 라인
            case "MID" -> side(lat, "LM", "CM", "RM");    // 중앙/수비형 미드
            case "AM" -> side(lat, "LW", "CAM", "RW");    // 공격형 미드·윙
            default -> side(lat, "LW", "ST", "RW");       // 최전방(FW)
        };
    }

    /** FotMob positionId 십의 자리 밴드 → 라인. 라인 개수와 무관해 가장 정확. 없으면 null. */
    private static String bandFromPositionId(Integer id) {
        if (id == null) return null;
        if (id < 30) return "GK";    // 11
        if (id < 50) return "DEF";   // 32~38 (+ 윙백 4x)
        if (id < 80) return "MID";   // 62~79 (수비형/중앙 미드)
        if (id < 100) return "AM";   // 84~86 (공격형 미드·윙)
        return "FW";                 // 105·115 (최전방)
    }

    /** positionId가 없을 때만 쓰는 좌표 깊이 폴백(라인 개수에 따라 부정확할 수 있음). */
    private static String bandFromPosX(Double posX) {
        if (posX == null) return null;
        if (posX < 0.15) return "GK";
        if (posX < 0.42) return "DEF";
        if (posX < 0.58) return "MID";
        if (posX < 0.78) return "AM";
        return "FW";
    }

    /** 팀 기준 좌우(L/C/R). 원정팀은 posY를 미러해 자기 팀 관점으로 본다. */
    private static char lateral(Double posY, boolean home) {
        if (posY == null) return 'C';
        double t = home ? posY : 1.0 - posY;
        if (t < 0.34) return 'L';
        if (t > 0.66) return 'R';
        return 'C';
    }

    private static String side(char lat, String left, String center, String right) {
        return lat == 'L' ? left : lat == 'R' ? right : center;
    }

    /** 좌표·밴드 모두 없을 때(라인업 미확정 등) positionId 라인 밴드로 대분류만. */
    private static String coarseFromPositionId(Integer id) {
        if (id == null) return null;
        if (id < 30) return "GK";
        if (id < 50) return "DF";
        if (id < 80) return "MF";
        if (id < 100) return "AM";
        return "FW";
    }
}
