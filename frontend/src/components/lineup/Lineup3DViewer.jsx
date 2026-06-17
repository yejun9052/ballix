// 3D 라인업 뷰어 — 좌표가 있는 선발 라인업을 3D 경기장/테이블축구로 본다.
// three.js 번들이 무거워 lazy import로 분리(버튼을 누를 때만 로드).
import { useState, lazy, Suspense } from "react";
import { StateMessage } from "../common/StateMessage.jsx";

const Stadium3D = lazy(() => import("./Stadium3D.jsx"));
const Foosball = lazy(() => import("./Foosball.jsx"));

export function Lineup3DViewer({ lineup = [], homeFormation = "", awayFormation = "" }) {
  const [view, setView] = useState(null); // "stadium" | "foosball" | null

  const starters = lineup.filter((player) => player.starter);
  const hasCoords = starters.some(
    (player) => Number.isFinite(player.posX) && Number.isFinite(player.posY),
  );
  // 피치 좌표가 없으면(킥오프 전·평점 미커버) 3D 배치가 불가하므로 숨긴다.
  if (starters.length === 0 || !hasCoords) {
    return null;
  }

  const toggle = (next) => setView((current) => (current === next ? null : next));

  return (
    <div className="lineup3d">
      <div className="lineup3d-actions">
        <button
          type="button"
          className={`lineup3d-btn ${view === "stadium" ? "is-active" : ""}`}
          onClick={() => toggle("stadium")}
        >
          🏟 3D 경기장 라인업
        </button>
        <button
          type="button"
          className={`lineup3d-btn ${view === "foosball" ? "is-active" : ""}`}
          onClick={() => toggle("foosball")}
        >
          🎮 테이블축구
        </button>
      </div>

      {view && (
        <div className="lineup3d-stage">
          <Suspense fallback={<StateMessage text="3D 뷰를 불러오는 중" />}>
            {view === "stadium" ? (
              <Stadium3D lineups={lineup} />
            ) : (
              <Foosball
                lineups={lineup}
                homeFormation={homeFormation}
                awayFormation={awayFormation}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  );
}
