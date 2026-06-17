import API from "./index";

// 리그 순위(조별) — 공개. competitionId = 내부 Competition PK
export const getStandings = (competitionId, { page = 0, size = 100 } = {}) => {
  return API.get(`/api/fotmob/standings/${competitionId}?page=${page}&size=${size}`);
};
