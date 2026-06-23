// AI 승률 카드 — 홈/무/원정 확률 막대 + 관리자 재예측
import { TeamCrest } from "../common/TeamCrest.jsx";
import { AiPredictionExplainer } from "./AiPredictionExplainer.jsx";

export function AiProbabilityCard({ isAdmin, isLoading, match, onRegenerate }) {
  const homeValue = match.prediction.home;
  const drawValue = match.prediction.draw;
  const awayValue = match.prediction.away;

  return (
    <section className="probability-table">
      <div className="probability-meta">
        <span>#{match.id} · {match.category}</span>
        <span>{match.matchTimeRaw?.replace("T", " ").slice(0, 16) || match.matchTime} · {match.status}</span>
      </div>

      <div className="probability-matchup">
        <div className="probability-team home">
          <strong>{match.homeTeam}</strong>
          <TeamCrest crest={match.homeCrest} name={match.homeTeam} size="flag" />
        </div>
        <b>vs</b>
        <div className="probability-team away">
          <TeamCrest crest={match.awayCrest} name={match.awayTeam} size="flag" />
          <strong>{match.awayTeam}</strong>
        </div>
      </div>

      <div className="probability-stack" aria-label="AI 승률">
        <span className="home" style={{ width: `${homeValue}%` }}>{homeValue}%</span>
        <span className="draw" style={{ width: `${drawValue}%` }}>{drawValue}%</span>
        <span className="away" style={{ width: `${awayValue}%` }}>{awayValue}%</span>
      </div>

      <div className="probability-legend">
        <span><i className="home" />{match.homeTeam} {homeValue}%</span>
        <span><i className="draw" />무 {drawValue}%</span>
        <span><i className="away" />{match.awayTeam} {awayValue}%</span>
      </div>

      {Number.isFinite(match.raw?.aiHomeScore) && Number.isFinite(match.raw?.aiAwayScore) && (
        <div className="ai-score">
          <span>AI 예상 스코어</span>
          <strong>{match.raw.aiHomeScore} : {match.raw.aiAwayScore}</strong>
        </div>
      )}

      {/* 산출 방식 설명 — 접고 펼 수 있는 박스(포트폴리오용) */}
      <AiPredictionExplainer />

      {isAdmin && (
        <button
          className="repredict-button"
          type="button"
          onClick={onRegenerate}
          disabled={isLoading}
        >
          {isLoading ? "재예측 중" : "재예측"}
        </button>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 공지 배너 (메인 피드 상단)
// ─────────────────────────────────────────────────────────────
