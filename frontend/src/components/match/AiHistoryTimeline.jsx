// AI 승률 예측 히스토리 — 경기 전→90분 단계별 승률 변화 + 변동 사유 타임라인.
// 관리자가 경기 전 예측을 켠 경기에서만 데이터가 쌓인다(빈 배열이면 렌더 안 함).
import { useEffect, useState } from "react";
import { getAiHistory } from "../../api/match.js";

const PHASE_LABEL = {
  0: "경기 전",
  15: "전반 15분",
  30: "전반 30분",
  45: "전반 종료",
  60: "후반 15분",
  75: "후반 30분",
  90: "후반 종료",
};
const phaseLabel = (m) => PHASE_LABEL[m] ?? `${m}분`;

export function AiHistoryTimeline({ matchId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    getAiHistory(matchId)
      .then((d) => alive && setRows(Array.isArray(d) ? d : []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [matchId]);

  // 변화 이력이 2개 이상(=경기 전 + 라이브 갱신 최소 1회) 있어야 의미가 있다.
  if (!rows || rows.length < 2) return null;

  return (
    <div className="ai-history">
      <div className="ai-history-head">승률 변화 히스토리</div>
      <ol className="ai-history-list">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1] : null;
          const delta = prev ? r.homePct - prev.homePct : 0;
          return (
            <li className="ai-history-item" key={r.phaseMinute}>
              <div className="ai-history-when">
                <span className="ai-history-dot" />
                <strong>{phaseLabel(r.phaseMinute)}</strong>
                {r.homeScore != null && (
                  <span className="ai-history-score">{r.homeScore} : {r.awayScore}</span>
                )}
              </div>
              <div className="ai-history-pcts">
                <span className="ahp home">홈 {r.homePct}%</span>
                <span className="ahp draw">무 {r.drawPct}%</span>
                <span className="ahp away">원정 {r.awayPct}%</span>
                {prev && delta !== 0 && (
                  <span className={`ahp-delta ${delta > 0 ? "up" : "down"}`}>
                    {delta > 0 ? "▲" : "▼"} 홈 {Math.abs(delta)}%p
                  </span>
                )}
              </div>
              {r.reason && r.phaseMinute !== 0 && (
                <p className="ai-history-reason">{r.reason}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
