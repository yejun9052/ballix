// AI 승률 예측 히스토리 — 경기 전→90분을 15분 단위로 끊은 단계별 승률 스냅샷.
// ‹ › 화살표(또는 아래 점)로 단계를 넘기며 그 시점의 홈/무/원정 승률·변동·사유를 본다.
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

export function AiHistoryTimeline({ matchId, homeName = "홈", awayName = "원정" }) {
  const [rows, setRows] = useState(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    getAiHistory(matchId)
      .then((d) => {
        if (!alive) return;
        setRows(Array.isArray(d) ? d : []);
        setIdx(0); // 경기 전(0)부터 시작 — › 로 시간순으로 넘겨본다
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [matchId]);

  if (!rows || rows.length === 0) return null;

  const cur = rows[idx];
  const prev = idx > 0 ? rows[idx - 1] : null;
  const atFirst = idx === 0;
  const atLast = idx === rows.length - 1;
  const go = (next) => setIdx((i) => Math.min(rows.length - 1, Math.max(0, next ?? i)));

  return (
    <div className="ai-history">
      <div className="ai-history-head">승률 변화 히스토리</div>

      <div className="aih-stepper">
        <button
          type="button"
          className="aih-nav"
          disabled={atFirst}
          onClick={() => go(idx - 1)}
          aria-label="이전 단계"
        >
          ‹
        </button>

        <div className="aih-stage">
          <div className="aih-phase">
            <strong>{phaseLabel(cur.phaseMinute)}</strong>
            {cur.homeScore != null && (
              <span className="aih-score">{cur.homeScore} : {cur.awayScore}</span>
            )}
          </div>

          <div className="aih-bars">
            <PctRow label={homeName} pct={cur.homePct} delta={prev ? cur.homePct - prev.homePct : null} cls="home" />
            <PctRow label="무승부" pct={cur.drawPct} delta={prev ? cur.drawPct - prev.drawPct : null} cls="draw" />
            <PctRow label={awayName} pct={cur.awayPct} delta={prev ? cur.awayPct - prev.awayPct : null} cls="away" />
          </div>

          {cur.reason && <p className="aih-reason">{cur.reason}</p>}
        </div>

        <button
          type="button"
          className="aih-nav"
          disabled={atLast}
          onClick={() => go(idx + 1)}
          aria-label="다음 단계"
        >
          ›
        </button>
      </div>

      <div className="aih-dots">
        {rows.map((r, i) => (
          <button
            key={r.phaseMinute}
            type="button"
            className={`aih-dot ${i === idx ? "active" : ""}`}
            onClick={() => go(i)}
            aria-label={phaseLabel(r.phaseMinute)}
            title={phaseLabel(r.phaseMinute)}
          />
        ))}
        <span className="aih-count">{idx + 1} / {rows.length}</span>
      </div>
    </div>
  );
}

/** 한 결과(홈/무/원정)의 승률 막대 + 직전 단계 대비 변동(▲/▼ %p). */
function PctRow({ label, pct, delta, cls }) {
  return (
    <div className="aih-row">
      <span className="aih-row-label">{label}</span>
      <div className="aih-row-track">
        <div className={`aih-row-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="aih-row-pct">{pct}%</span>
      <span className={`aih-row-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
        {delta != null && delta !== 0 ? `${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}` : ""}
      </span>
    </div>
  );
}
