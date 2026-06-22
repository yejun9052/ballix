// 경기 데이터 가공 — 백엔드 응답을 화면용 형태로 정규화, 점수·필터·정렬 계산
import { getTeamName } from "./team.js";
import { formatMatchDateTime } from "./format.js";
import { fallbackPrediction, aiFallback, statusLabels, WORLD_CUP_LEAGUE_ID } from "./constants.js";

export function getMatchScore(match) {
  if (!["IN_PLAY", "FINISHED"].includes(match.status)) {
    return "";
  }

  return `${match.homeScore ?? 0} : ${match.awayScore ?? 0}`;
}


export function normalizeMatch(match) {
  const homeTeam = getTeamName(match.homeTeam);
  const awayTeam = getTeamName(match.awayTeam);
  const hasAiPrediction =
    Number.isFinite(match.aiHomePct) &&
    Number.isFinite(match.aiDrawPct) &&
    Number.isFinite(match.aiAwayPct);

  return {
    id: match.id,
    raw: match,
    category: match.competition?.name || "대회 미정",
    homeTeam,
    awayTeam,
    homeTeamOriginal: match.homeTeam?.name || homeTeam,
    awayTeamOriginal: match.awayTeam?.name || awayTeam,
    homeCrest: match.homeTeam?.crest || "",
    awayCrest: match.awayTeam?.crest || "",
    matchTime: formatMatchDateTime(match.matchTime),
    matchTimeRaw: match.matchTime,
    venue: match.venue || "경기장 미정",
    group: match.groupName || match.stage || "일정",
    stage: match.stage || null,
    bracketOrder: match.bracketOrder ?? null,
    status: statusLabels[match.status] || match.status || "상태 미정",
    statusRaw: match.status,
    score: getMatchScore(match),
    prediction: hasAiPrediction
      ? {
          home: match.aiHomePct,
          draw: match.aiDrawPct,
          away: match.aiAwayPct,
        }
      : fallbackPrediction,
    aiPick: match.predictionEnabled ? "AI 승률 생성 완료" : aiFallback.aiPick,
    aiReason: match.aiSummary || aiFallback.aiReason,
    hasAiPrediction,
    predictionEnabled: Boolean(match.predictionEnabled),
    isWorldCup:
      match.fotmobLeagueId === WORLD_CUP_LEAGUE_ID ||
      match.competition?.fotmobLeagueId === WORLD_CUP_LEAGUE_ID,
  };
}


export function getCompetitionFilterValue(match) {
  const leagueId = match.raw?.competition?.fotmobLeagueId;
  const name = match.category.toLowerCase();

  if (leagueId === 77 || name.includes("world cup")) {
    return "worldcup";
  }

  if (leagueId === 114 || name.includes("friendly") || name.includes("friendlies")) {
    return "friendly";
  }

  if (leagueId === 47 || name.includes("premier league") || name === "pl") {
    return "pl";
  }

  return "other";
}


export function compareMatches(a, b) {
  const aLive = a.statusRaw === "IN_PLAY";
  const bLive = b.statusRaw === "IN_PLAY";
  if (aLive !== bLive) return aLive ? -1 : 1;
  return new Date(a.matchTimeRaw).getTime() - new Date(b.matchTimeRaw).getTime();
}

// ─────────────────────────────────────────────────────────────
// 라이브 시계 (liveStartedAt 앵커 → 클라이언트에서 초 단위로 흐름)
// ─────────────────────────────────────────────────────────────
// FotMob SSR 스냅샷은 실제 경기 진행시간보다 몇 분 지연된다. 화면 시계가
// 실제와 가깝게 보이도록 앵커 경과초에 이만큼 더해 보정한다.
