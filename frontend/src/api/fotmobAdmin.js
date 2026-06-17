import API from "./index";

// 날짜 범위 일정 동기화 + 시즌 전체 일정 upsert
export const syncSchedule = ({ pastDays = 7, futureDays = 14 } = {}) => {
  return API.post(
    `/api/fotmob/schedule/sync?pastDays=${pastDays}&futureDays=${futureDays}`,
  );
};

// 특정 날짜(YYYYMMDD) 일정만 동기화
export const syncScheduleByDate = (yyyymmdd) => {
  return API.post(`/api/fotmob/schedule/sync/${yyyymmdd}`);
};

// 경기 1건 즉시 동기화
export const syncMatch = (matchId) => {
  return API.post(`/api/match/${matchId}/fotmob/sync`);
};

// 리그 순위 강제 갱신
export const syncStandings = (competitionId) => {
  return API.post(`/api/fotmob/standings/${competitionId}/sync`);
};

// 팀(나라) 이름 전체 재번역 — nameKo 비어있는 팀만
export const translateTeams = () => {
  return API.post(`/api/fotmob/teams/translate`);
};

// 폴링 주기(분) 조회/변경
export const getPollInterval = () => {
  return API.get(`/api/fotmob/poll-interval`);
};

export const setPollInterval = (minutes) => {
  return API.post(`/api/fotmob/poll-interval?minutes=${minutes}`);
};

// DB 미저장 미리보기(프록시)
export const previewMatch = (fotmobId) => {
  return API.get(`/api/fotmob/preview/${fotmobId}`);
};

// 팀명/대회로 FotMob matchId 후보 검색
export const searchMatch = ({ team1 = "", team2 = "", competition = "" } = {}) => {
  const params = new URLSearchParams();
  if (team1) params.set("team1", team1);
  if (team2) params.set("team2", team2);
  if (competition) params.set("competition", competition);
  return API.get(`/api/fotmob/search?${params.toString()}`);
};
