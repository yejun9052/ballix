import API from "./index";

// 전체 경기 목록(AI 예측 켜진 경기 우선 정렬)
export const getAllMatches = ({ page = 0, size = 100 } = {}) => {
  return API.get(`/api/match/allMatch?page=${page}&size=${size}`);
};

// 월드컵 경기 목록(competitionId=6)
export const getWorldCupMatches = ({ page = 0, size = 100 } = {}) => {
  return API.get(`/api/match/findByCompId?id=6&page=${page}&size=${size}`);
};

// 날짜별 경기 목록(없는 날짜는 백엔드가 즉석 크롤·저장)
export const getMatchesByDate = (date, { page = 0, size = 100 } = {}) => {
  return API.get(`/api/match/MatchDay?date=${date}&page=${page}&size=${size}`);
};

// 경기 상세(라인업·이벤트 포함 뷰)
export const getFotmobView = (matchId) => {
  return API.get(`/api/match/${matchId}/fotmob`);
};

// AI 골 요약(종료 경기) — 공개
export const getAiSummary = (matchId) => {
  return API.get(`/api/match/${matchId}/ai/summary`);
};

// AI 승률 예측 히스토리(단계별 승률·스코어·변동 사유) — 공개. 예측 안 켠 경기는 빈 배열.
export const getAiHistory = (matchId) => {
  return API.get(`/api/match/${matchId}/ai/history`);
};

// 하이라이트 영상(종료 경기) — 공개, DB-first lazy 검색
export const getHighlight = (matchId) => {
  return API.get(`/api/match/${matchId}/highlight`);
};

// 선수 상세(프로필 info + 시즌 스탯) — 경기/실시간 무관 별도 API. playerId = fotmobPlayerId. DB-first lazy-cache.
// 경기 모달도 기본 프로필(키·몸무게·주발 등)을 위해 호출하며, 시즌 스탯 그리드만 버튼으로 펼친다.
export const getPlayerSeason = (playerId) => {
  return API.get(`/api/player/${playerId}`);
};
