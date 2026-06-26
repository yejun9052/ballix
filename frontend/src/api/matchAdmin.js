import API from "./index";

// 다시보기(유튜브) 등록/교체 — youtube = videoId(11자) 또는 URL. 종료 경기만.
export const setReplay = (matchId, youtube) => {
  return API.put(
    `/api/admin/match/${matchId}/replay?youtube=${encodeURIComponent(youtube)}`,
  );
};

// 다시보기 해제
export const clearReplay = (matchId) => {
  return API.delete(`/api/admin/match/${matchId}/replay`);
};

// 하이라이트 일괄 보강(수동) — 종료됐는데 영상 없는 최근 경기를 즉시 재검색. 채운 건수 반환.
export const backfillHighlights = ({ limit = 10, sinceDays = 7 } = {}) => {
  return API.post(`/api/admin/match/highlights/backfill?limit=${limit}&sinceDays=${sinceDays}`);
};

// 특정 경기 영상 강제 재동기화 — 기존(잘못된) 영상 비우고 즉시 재검색. 새 videoId(또는 null) 반환.
export const resyncHighlight = (matchId) => {
  return API.post(`/api/admin/match/${matchId}/highlight/resync`);
};
