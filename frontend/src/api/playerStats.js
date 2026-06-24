import API from "./index";
import { WORLD_CUP_LEAGUE_ID } from "../utils/constants.js";

// 리그 개인 기록(득점왕/도움왕) — 공개. leagueId = FotMob 리그 ID(기본 월드컵 77).
// 응답: { scorers: PlayerStatView[], assists: PlayerStatView[] }
export const getPlayerStats = (leagueId = WORLD_CUP_LEAGUE_ID) =>
  API.get(`/api/fotmob/player-stats/${leagueId}`);

// 개인 기록 강제 갱신(관리자) — FotMob 재크롤 후 갱신된 보드를 반환.
export const syncPlayerStats = (leagueId = WORLD_CUP_LEAGUE_ID) =>
  API.post(`/api/fotmob/player-stats/${leagueId}/sync`);
