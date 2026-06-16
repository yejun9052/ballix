// 공통 상수 — 상태/승자 라벨, 필터 옵션, 리그 ID, AI 폴백 등 앱 전반의 고정값

export const fallbackPrediction = { home: 34, draw: 33, away: 33 };
export const statusLabels = {
  SCHEDULED: "예정",
  IN_PLAY: "진행 중",
  FINISHED: "종료",
  CANCELLED: "취소",
};
export const winnerLabels = {
  HOME_TEAM: "홈 승",
  DRAW: "무승부",
  AWAY_TEAM: "원정 승",
};
export const WORLD_CUP_LEAGUE_ID = 77;
export const LEADERBOARD_MIN_MATCHES = 5;
// 메인 일정은 현재 클라이언트에서 한 번에 전부 받아 프론트에서 필터링한다.
// TODO: DB 경기 수가 이 값을 넘으면 누락된다 → 서버측 필터/페이지네이션으로 전환 필요.
export const MATCH_LIST_FETCH_SIZE = 500;
export const aiFallback = {
  aiPick: "AI 분석 대기",
  aiReason:
    "이 경기는 아직 관리자가 AI 승률 예측 대상으로 선택하지 않았습니다. 선택되면 홈/무/원정 확률과 근거가 표시됩니다.",
};
export const competitionFilters = [
  { label: "전체", value: "all" },
  { label: "월드컵", value: "worldcup" },
  { label: "친선", value: "friendly" },
  { label: "PL", value: "pl" },
];

export const aiFilters = [
  { label: "전체", value: "all" },
  { label: "AI 승률 있음", value: "with" },
  { label: "AI 승률 없음", value: "without" },
];

export const FOTMOB_SSR_DELAY_COMPENSATION_SECONDS = 180;
