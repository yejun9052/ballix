// 개인성적 화면 — 월드컵 득점왕 / 도움왕 (FotMob 크롤)
import { useEffect, useState } from "react";
import { getPlayerStats, syncPlayerStats } from "../api/playerStats.js";
import { getTeamNameByOriginal } from "../utils/team.js";
import { StateMessage } from "../components/common/StateMessage.jsx";
import { PlayerModal } from "../components/common/PlayerModal.jsx";

const PLAYER_IMG = (id) =>
  `https://images.fotmob.com/image_resources/playerimages/${id}.png`;
const TEAM_CREST = (id) =>
  `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;

function StatTable({ title, unit, rows, onSelectPlayer }) {
  return (
    <div className="playerstat-block">
      <h3 className="playerstat-title">{title}</h3>
      {rows.length === 0 ? (
        <StateMessage text="아직 기록이 없습니다" />
      ) : (
        <table className="standings-table playerstat-table">
          <thead>
            <tr>
              <th>#</th>
              <th>선수</th>
              <th>경기</th>
              <th>{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr
                key={`${p.fotmobPlayerId ?? p.playerName}-${i}`}
                className={p.fotmobPlayerId ? "playerstat-row-clickable" : ""}
                onClick={p.fotmobPlayerId ? () => onSelectPlayer(p) : undefined}
              >
                <td className="rank-col">{p.rank ?? i + 1}</td>
                <td className="player-col">
                  {p.fotmobPlayerId && (
                    <img
                      src={PLAYER_IMG(p.fotmobPlayerId)}
                      alt=""
                      className="playerstat-photo"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  )}
                  <span className="playerstat-name">{p.playerName}</span>
                  {p.fotmobTeamId && (
                    <img
                      src={TEAM_CREST(p.fotmobTeamId)}
                      alt=""
                      className="playerstat-crest"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <span className="playerstat-team">
                    {getTeamNameByOriginal(p.teamName)}
                  </span>
                </td>
                <td>{p.matchesPlayed ?? "-"}</td>
                <td>
                  <b>{p.value ?? 0}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function PlayerStatsScreen({ onBack, user }) {
  const [board, setBoard] = useState({ scorers: [], assists: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const isAdmin = user?.role === "ADMIN_USER";

  useEffect(() => {
    getPlayerStats()
      .then((data) =>
        setBoard({
          scorers: data?.scorers || [],
          assists: data?.assists || [],
        }),
      )
      .catch((err) =>
        setError(err.response?.data?.msg || "개인 기록을 불러오지 못했습니다."),
      )
      .finally(() => setIsLoading(false));
  }, []);

  // 관리자: FotMob 재크롤로 기록 강제 갱신 후 보드 교체
  async function handleRefresh() {
    setRefreshing(true);
    setMsg("");
    try {
      const data = await syncPlayerStats();
      setBoard({ scorers: data?.scorers || [], assists: data?.assists || [] });
      setMsg("✅ 갱신 완료");
    } catch (err) {
      setMsg(`❌ 갱신 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>개인성적</strong>
          <span className="account-chip subtle">{user?.name || "게스트"}</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">PLAYER STATS</span>
          <h1>월드컵 득점왕 · 도움왕</h1>
          <p>경기 결과에 따라 갱신됩니다.</p>
        </section>

        <section className="detail-panel board-panel playerstat-panel">
          {isAdmin && (
            <div className="playerstat-admin">
              {msg && <span className="playerstat-msg">{msg}</span>}
              <button
                type="button"
                className="playerstat-refresh"
                disabled={refreshing}
                onClick={handleRefresh}
              >
                {refreshing ? "갱신 중…" : "↻ 기록 갱신"}
              </button>
            </div>
          )}
          {isLoading && <StateMessage text="개인 기록을 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && (
            <div className="playerstat-grid">
              <StatTable title="⚽ 득점왕" unit="골" rows={board.scorers} onSelectPlayer={setSelectedPlayer} />
              <StatTable title="🅰️ 도움왕" unit="도움" rows={board.assists} onSelectPlayer={setSelectedPlayer} />
            </div>
          )}
        </section>
      </section>
      {selectedPlayer && (
        <PlayerModal
          playerId={selectedPlayer.fotmobPlayerId}
          fallbackName={selectedPlayer.playerName}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}
