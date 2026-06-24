// AI 승률 카드 — 최초(킥오프 전) / 실시간 예측을 나눠 표시 + 관리자 재예측
import { TeamCrest } from "../common/TeamCrest.jsx";
import { AiPredictionExplainer } from "./AiPredictionExplainer.jsx";

// 변화량 배지 — 실시간 값이 최초 대비 얼마나 움직였는지(+/-). 0이면 표시 안 함.
function Delta({ now, base }) {
  if (!Number.isFinite(now) || !Number.isFinite(base)) return null;
  const d = now - base;
  if (d === 0) return null;
  return (
    <em className={`ai-delta ${d > 0 ? "up" : "down"}`}>
      {d > 0 ? "▲" : "▼"}{Math.abs(d)}
    </em>
  );
}

// 확률 막대 + 범례 + 예상 스코어 한 블록.
function ProbBlock({ label, sub, home, away, values, compare, scoreHome, scoreAway }) {
  return (
    <div className="ai-pred-block">
      <div className="ai-pred-label">
        <strong>{label}</strong>
        {sub && <span>{sub}</span>}
      </div>

      <div className="probability-stack" aria-label={`${label} AI 승률`}>
        <span className="home" style={{ width: `${values.home}%` }}>{values.home}%</span>
        <span className="draw" style={{ width: `${values.draw}%` }}>{values.draw}%</span>
        <span className="away" style={{ width: `${values.away}%` }}>{values.away}%</span>
      </div>

      <div className="probability-legend">
        <span>
          <i className="home" />{home} {values.home}%
          {compare && <Delta now={values.home} base={compare.home} />}
        </span>
        <span>
          <i className="draw" />무 {values.draw}%
          {compare && <Delta now={values.draw} base={compare.draw} />}
        </span>
        <span>
          <i className="away" />{away} {values.away}%
          {compare && <Delta now={values.away} base={compare.away} />}
        </span>
      </div>

      {Number.isFinite(scoreHome) && Number.isFinite(scoreAway) && (
        <div className="ai-score">
          <span>AI 예상 스코어</span>
          <strong>{scoreHome} : {scoreAway}</strong>
        </div>
      )}
    </div>
  );
}

export function AiProbabilityCard({ isAdmin, isLoading, match, onRegenerate }) {
  const raw = match.raw || {};
  const initial = match.predictionInitial;        // 최초 스냅샷(없으면 null)
  const live = match.prediction;                  // 실시간(현재)
  const hasSplit = Boolean(initial);              // 최초 스냅샷이 있을 때만 둘로 나눔

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

      <div className={`ai-split ${hasSplit ? "two" : "one"}`}>
        {hasSplit && (
          <ProbBlock
            label="최초 예측"
            sub="킥오프 전"
            home={match.homeTeam}
            away={match.awayTeam}
            values={initial}
            scoreHome={raw.aiInitialHomeScore}
            scoreAway={raw.aiInitialAwayScore}
          />
        )}
        <ProbBlock
          label={hasSplit ? "실시간 예측" : "AI 승률"}
          sub={hasSplit ? "현재" : undefined}
          home={match.homeTeam}
          away={match.awayTeam}
          values={live}
          compare={hasSplit ? initial : null}
          scoreHome={raw.aiHomeScore}
          scoreAway={raw.aiAwayScore}
        />
      </div>

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
