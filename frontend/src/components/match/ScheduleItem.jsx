// 경기 일정 카드 — 메인 목록의 스코어 카드(클릭 시 상세 이동, 관리자 AI 생성)
import { useState } from "react";
import { LiveClock } from "../common/LiveClock.jsx";
import { TeamCrest } from "../common/TeamCrest.jsx";

export function ScheduleItem({ isAdmin, item, live = false, onGenerateAi, onSelect }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate(event) {
    event.stopPropagation();
    setIsGenerating(true);
    setError("");
    try {
      await onGenerateAi(item.id, { force: false });
    } catch (generateError) {
      setError(generateError.message || "생성 실패");
    } finally {
      setIsGenerating(false);
    }
  }

  const canGenerate =
    isAdmin && !item.hasAiPrediction && !["FINISHED", "CANCELLED"].includes(item.statusRaw);

  return (
    <article
      className={`prediction-item schedule-item ${live ? "is-live" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="item-meta">
        <span>{item.category}</span>
        <b>{item.group}</b>
        {item.hasAiPrediction && <span className="ai-flag">AI 승률</span>}
        {item.statusRaw === "IN_PLAY" && <LiveClock match={item} />}
      </div>
      <div className="item-body">
        <div className="match-team home">
          <TeamCrest crest={item.homeCrest} name={item.homeTeam} />
          <strong>{item.homeTeam}</strong>
        </div>
        <div className="match-centerline">
          <h3>VS</h3>
          {item.score && <strong className="match-scoreline">{item.score}</strong>}
          <p className="match-subtext">{item.matchTime} · {item.venue}</p>
        </div>
        <div className="match-team away">
          <strong>{item.awayTeam}</strong>
          <TeamCrest crest={item.awayCrest} name={item.awayTeam} />
        </div>
        <div className="status-pill">
          <strong>{item.status}</strong>
          <span>상세 보기</span>
        </div>
      </div>
      <footer>
        {canGenerate ? (
          <button
            type="button"
            className="inline-ai-button"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "AI 승률 생성 중" : "AI 승률 생성"}
          </button>
        ) : (
          <span>대회 {item.category}</span>
        )}
        {error ? <strong className="action-error">{error}</strong> : <strong>상세 보기</strong>}
      </footer>
    </article>
  );
}

