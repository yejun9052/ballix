// 리더보드 화면 — 포인트 기준 랭킹(페이지네이션)
import { useEffect, useState } from "react";
import { getLeaderboard } from "../api/user.js";
import { getPageContent } from "../utils/format.js";
import { LEADERBOARD_MIN_MATCHES } from "../utils/constants.js";
import { StateMessage } from "../components/common/StateMessage.jsx";

const PAGE_SIZE = 10;

export function LeaderboardScreen({ onBack, user }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);          // 0-based
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");

    getLeaderboard({ page, size: PAGE_SIZE })
      .then((data) => {
        if (mounted) {
          setRows(getPageContent(data));
          setTotalPages(data?.totalPages ?? 0);
          setTotalElements(data?.totalElements ?? 0);
        }
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError.response?.data?.msg || "랭킹을 불러오지 못했습니다.");
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
  }, [page]);

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>랭킹</strong>
          <span className="account-chip subtle">{user?.name || "게스트"}</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">LEADERBOARD</span>
          <h1>포인트 랭킹</h1>
          <p>역배 가중 누적 포인트 순위입니다. {LEADERBOARD_MIN_MATCHES}경기 이상 참여하면 공식 순위에 집계됩니다.</p>
        </section>

        <section className="detail-panel board-panel">
          {isLoading && <StateMessage text="랭킹을 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && rows.length === 0 && (
            <StateMessage text="아직 집계된 랭킹이 없습니다" />
          )}
          {!isLoading && !error && rows.length > 0 && (
            <ol className="rank-table">
              <li className="rank-row rank-head">
                <span className="rank-no">순위</span>
                <span className="rank-name">이름</span>
                <span className="rank-stat rank-points">포인트</span>
                <span className="rank-stat">경기</span>
                <span className="rank-stat">적중</span>
                <span className="rank-stat">적중률</span>
              </li>
              {rows.map((row) => {
                const eligible = row.matchesPlayed >= LEADERBOARD_MIN_MATCHES;
                const isMe = user && row.name === user.name;
                return (
                  <li
                    className={`rank-row ${eligible ? "" : "is-pending"} ${isMe ? "is-me" : ""}`}
                    key={`${row.rank}-${row.name}`}
                  >
                    <span className="rank-no">{eligible ? row.rank : "—"}</span>
                    <span className="rank-name">
                      {row.name}
                      {isMe && <em className="me-tag">나</em>}
                    </span>
                    <span className="rank-stat rank-points">{row.score ?? 0}</span>
                    <span className="rank-stat">{row.matchesPlayed}</span>
                    <span className="rank-stat">{row.correctCount}</span>
                    <span className="rank-stat">{row.accuracy ?? row.winRate ?? "—"}%</span>
                  </li>
                );
              })}
            </ol>
          )}
          {!isLoading && !error && totalPages > 1 && (
            <div className="rank-pager">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← 이전
              </button>
              <span className="rank-pager-info">
                {page + 1} / {totalPages} 페이지 · 총 {totalElements}명
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                다음 →
              </button>
            </div>
          )}
          <p className="board-foot">
            회색 처리된 사용자는 {LEADERBOARD_MIN_MATCHES}경기 미만으로 아직 공식 순위에 들지 않습니다.
          </p>
        </section>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 내 예측 화면
// ─────────────────────────────────────────────────────────────
