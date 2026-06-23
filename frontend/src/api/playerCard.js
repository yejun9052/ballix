// 선수 카드 뽑기 API
import API from "./index.js";

// 카드 뽑기 — count: 1 | 10
export const drawPlayerCard = (count) =>
  API.post(`/api/playercard/draw?count=${count}`);

// 내 카드 목록
export const getMyCards = () => API.get("/api/playercard/my");
