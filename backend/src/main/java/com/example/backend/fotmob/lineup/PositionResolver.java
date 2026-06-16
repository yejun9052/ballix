package com.example.backend.fotmob.lineup;

/**
 * FotMob 라인업 좌표/포지션ID에서 사람이 읽는 세부 포지션 라벨
 * (GK·LB·CB·RB·LM·CM·RM·LW·CAM·RW·ST 등)을 파생한다.
 *
 * FotMob는 선수 객체에 읽을 수 있는 포지션 문자열을 주지 않고
 * {@code positionId}(그리드 코드)와 피치 좌표만 주므로 여기서 만든다.
 * 깊이(posX)로 라인을, 좌우(posY)로 좌/중/우를 정해 조합한다.
 *
 * 좌표계: FotMob posX=깊이(0=자기 GK, 1=상대 골), posY=좌우(홈팀 관점 절대좌표).
 * 어웨이팀은 좌우가 뒤집히므로 posY를 미러(1-y)해 팀 기준 좌우로 바꾼다
 * (프론트 배치도 {@code Pitch}의 미러 규약과 동일 → 라벨이 배치도 위치와 일치).
 * 팀 기준 t&lt;0.34=왼쪽(L), t&gt;0.66=오른쪽(R), 그 사이=중앙(C).
 */
public final class PositionResolver {

    private PositionResolver() {}

    /**
     * @param positionId FotMob 그리드 포지션 코드(11=GK …). 좌표가 없을 때의 폴백에만 사용.
     * @param posX       깊이 0~1(0=자기 GK쪽). null이면 좌표 없음 → positionId로 대분류만.
     * @param posY       좌우 0~1(홈팀 관점 절대좌표).
     * @param home       true=홈팀(posY 그대로), false=원정팀(posY 미러).
     * @return 세부 포지션 라벨. 정보가 전혀 없으면 null.
     */
    public static String resolve(Integer positionId, Double posX, Double posY, boolean home) {
        if (positionId != null && positionId == 11) return "GK";
        if (posX == null) return coarseFromPositionId(positionId);
        if (posX < 0.15) return "GK";

        char lat = lateral(posY, home);
        if (posX < 0.42) return side(lat, "LB", "CB", "RB");    // 수비 라인
        if (posX < 0.58) return side(lat, "LM", "CM", "RM");    // 중앙/수비형 미드
        if (posX < 0.78) return side(lat, "LW", "CAM", "RW");   // 공격형 미드·윙
        return side(lat, "LW", "ST", "RW");                     // 최전방
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

    /** 좌표가 없을 때(라인업 미확정 등) positionId 라인 밴드로 대분류만. */
    private static String coarseFromPositionId(Integer id) {
        if (id == null) return null;
        if (id == 11) return "GK";
        if (id < 50) return "DF";
        if (id < 80) return "MF";
        if (id < 100) return "AM";
        return "FW";
    }
}
