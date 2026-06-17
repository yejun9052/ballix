// 다시보기 — 종료 경기의 유튜브 다시보기 임베드 + 관리자 등록/해제(상세 페이지 인라인)
// highlightId: 수동 등록 영상이 없을 때 백엔드가 자동 검색한 하이라이트(DetailScreen이 전달)
import { useEffect, useState } from "react";
import { setReplay, clearReplay } from "../../api/matchAdmin.js";

export function ReplayPanel({ match, isAdmin, highlightId = "" }) {
  const manualId = match.raw?.replayYoutubeId || "";
  const [replayId, setReplayId] = useState(manualId || highlightId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isFinished = match.statusRaw === "FINISHED";

  // 수동 영상이 없으면 비동기로 도착한 자동 하이라이트를 반영한다.
  useEffect(() => {
    if (!manualId && highlightId) {
      setReplayId(highlightId);
    }
  }, [manualId, highlightId]);

  // 비관리자이고 영상도 없으면 패널 자체를 숨긴다.
  if (!replayId && !isAdmin) {
    return null;
  }

  async function handleSave() {
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    try {
      const updated = await setReplay(match.id, input.trim());
      setReplayId(updated?.replayYoutubeId || "");
      setInput("");
    } catch (e) {
      setError(e.response?.data?.msg || "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    setError("");
    try {
      await clearReplay(match.id);
      setReplayId("");
    } catch (e) {
      setError(e.response?.data?.msg || "해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="replay-panel">
      {replayId ? (
        <div className="replay-embed">
          <iframe
            src={`https://www.youtube.com/embed/${replayId}`}
            title="경기 다시보기"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <p className="replay-empty">등록된 다시보기 영상이 없습니다.</p>
      )}

      {isAdmin && (
        <div className="replay-admin">
          {!isFinished && <p className="replay-hint">※ 종료된 경기에만 등록할 수 있습니다.</p>}
          <div className="replay-admin-row">
            <input
              type="text"
              className="data-input"
              placeholder="유튜브 링크 또는 영상 ID"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!isFinished || busy}
            />
            <button
              type="button"
              className="data-btn"
              onClick={handleSave}
              disabled={!isFinished || busy || !input.trim()}
            >
              {busy ? "처리 중…" : "등록"}
            </button>
            {replayId && (
              <button type="button" className="data-btn secondary" onClick={handleClear} disabled={busy}>
                해제
              </button>
            )}
          </div>
          {error && <p className="action-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
