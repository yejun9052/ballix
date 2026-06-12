import { Eye, MessageCircle, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export function PredictionCard({ template }) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(template.matchTime));

  return (
    <article className="prediction-card">
      <div className="card-meta">
        <span className="league-pill">{template.league}</span>
        <span>{template.type}</span>
        <span>{date}</span>
        <span className={template.locked ? "chip muted" : "chip live"}>
          {template.status}
        </span>
      </div>

      <Link to={`/matches/${template.id}`} className="match-link">
        <div className="match-card-title">
          <strong>{template.title}</strong>
          <span>{template.aiPick}</span>
        </div>
        <div className="teams-row">
          <span className="team-name">
            <TeamCrest name={template.homeTeam} src={template.homeCrest} />
            <strong>{template.homeTeam}</strong>
          </span>
          <span className="score-box">{template.homeScore}</span>
        </div>
        <div className="teams-row">
          <span className="team-name">
            <TeamCrest name={template.awayTeam} src={template.awayCrest} />
            <strong>{template.awayTeam}</strong>
          </span>
          <span className="score-box">{template.awayScore}</span>
        </div>
      </Link>

      <div className="probability-grid">
        <Probability label="홈" value={template.odds.home} />
        <Probability label="무" value={template.odds.draw} />
        <Probability label="원정" value={template.odds.away} />
      </div>

      <div className="ai-summary">
        <Sparkles size={17} />
        <p>
          <strong>{template.aiPick}</strong>
          {template.aiSummary}
        </p>
      </div>

      <footer className="card-footer">
        <span className="trend-badge">
          <TrendingUp size={16} />
          {template.trend}
        </span>
        <span>
          <Eye size={16} />
          {template.views.toLocaleString()}
        </span>
        <span>
          <MessageCircle size={16} />
          {template.comments}
        </span>
        <Link to={`/matches/${template.id}`} className="primary-link">
          예측하기
        </Link>
      </footer>
    </article>
  );
}

function TeamCrest({ name, src }) {
  if (!src) {
    return <span className="team-fallback">{name.slice(0, 1)}</span>;
  }

  return <img className="team-crest" src={src} alt="" loading="lazy" />;
}

function Probability({ label, value }) {
  return (
    <div>
      <div className="probability-head">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="meter">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
