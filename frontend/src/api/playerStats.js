import API from "./index";
import { WORLD_CUP_LEAGUE_ID } from "../utils/constants.js";

// 리그 개인 기록(득점왕/도움왕) — 공개. leagueId = FotMob 리그 ID(기본 월드컵 77).
// 응답: { scorers: PlayerStatView[], assists: PlayerStatView[] }
export const getPlayerStats = (leagueId = WORLD_CUP_LEAGUE_ID) =>
  API.get(`/api/fotmob/player-stats/${leagueId}`);
