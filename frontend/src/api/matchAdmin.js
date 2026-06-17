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
