// 내 예측 화면 — 내가 남긴 예측과 채점 결과
import { useEffect, useState } from "react";
import { getMyPredictions } from "../api/prediction.js";
import { getPageContent } from "../utils/format.js";
import { winnerLabels } from "../utils/constants.js";
import { getTeamNameByOriginal } from "../utils/team.js";
import { StateMessage } from "../components/common/StateMessage.jsx";

export function MyPredictionsScreen({ onBack }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");

    getMyPredictions()
      .then((data) => {
        if (mounted) {
          setRows(getPageContent(data));
        }
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError.response?.data?.msg || "내 예측을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const gradedCount = rows.filter((row) => row.isCorrect != null).length;
  const correctCount = rows.filter((row) => row.isCorrect === true).length;

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>내 예측</strong>
          <span className="account-chip subtle">
            {gradedCount > 0 ? `${correctCount}/${gradedCount} 적중` : "채점 대기"}
          </span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">MY PICKS</span>
          <h1>내가 남긴 예측</h1>
          <p>경기가 종료되면 자동으로 채점되어 적중 여부가 표시됩니다.</p>
        </section>

        <section className="detail-panel board-panel">
          {isLoading && <StateMessage text="내 예측을 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && rows.length === 0 && (
            <StateMessage text="아직 남긴 예측이 없습니다" />
          )}
          {!isLoading && !error && rows.length > 0 && (
            <div className="my-pred-list">
              {rows.map((row) => {
                const homeName = getTeamNameByOriginal(row.homeTeamName);
                const awayName = getTeamNameByOriginal(row.awayTeamName);
                const resultClass =
                  row.isCorrect === true ? "correct" : row.isCorrect === false ? "wrong" : "pending";
                const resultLabel =
                  row.isCorrect === true ? "적중" : row.isCorrect === false ? "실패" : "대기";
                return (
                  <article className={`my-pred-row ${resultClass}`} key={row.id}>
                    <div className="my-pred-teams">
                      <strong>{homeName}</strong>
                      <span>vs</span>
                      <strong>{awayName}</strong>
                    </div>
                    <div className="my-pred-pick">
                      내 예측 · <b>{winnerLabels[row.predictedWinner] || row.predictedWinner}</b>
                    </div>
                    <span className={`my-pred-result ${resultClass}`}>{resultLabel}</span>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 경기 상세 화면
// ─────────────────────────────────────────────────────────────
