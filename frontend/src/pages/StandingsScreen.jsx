// 순위표 화면 — 월드컵 조별 순위
import { useEffect, useState } from "react";
import { getStandings } from "../api/standings.js";
import { getPageContent, getGroupLabel } from "../utils/format.js";
import { getTeamNameByOriginal } from "../utils/team.js";
import { StateMessage } from "../components/common/StateMessage.jsx";

export function StandingsScreen({ onBack, user }) {
  const [standings, setStandings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getStandings(6)
      .then((data) => setStandings(getPageContent(data)))
      .catch((err) => setError(err.response?.data?.msg || "순위를 불러오지 못했습니다."))
      .finally(() => setIsLoading(false));
  }, []);

  const groups = {};
  for (const row of standings) {
    if (!groups[row.groupName]) groups[row.groupName] = [];
    groups[row.groupName].push(row);
  }
  const groupNames = Object.keys(groups).sort();

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>순위표</strong>
          <span className="account-chip subtle">{user?.name || "게스트"}</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">STANDINGS</span>
          <h1>월드컵 조별 순위</h1>
          <p>조별 리그 경기 결과에 따라 실시간 갱신됩니다.</p>
        </section>

        <section className="detail-panel board-panel standings-panel">
          {isLoading && <StateMessage text="순위를 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && groupNames.length === 0 && (
            <StateMessage text="아직 순위 데이터가 없습니다" />
          )}
          {!isLoading && !error && groupNames.map((groupName) => (
            <div key={groupName} className="standings-group">
              <h3 className="standings-group-name">{getGroupLabel(groupName)}</h3>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>팀</th>
                    <th>경기</th>
                    <th>승</th>
                    <th>무</th>
                    <th>패</th>
                    <th>득실</th>
                    <th>승점</th>
                  </tr>
                </thead>
                <tbody>
                  {[...groups[groupName]]
                    .sort((a, b) => a.rankNo - b.rankNo)
                    .map((row) => (
                      <tr key={row.id}>
                        <td className="rank-col">{row.rankNo}</td>
                        <td className="team-col">
                          {row.crest && (
                            <img src={row.crest} alt="" className="standings-crest" />
                          )}
                          <span>{getTeamNameByOriginal(row.teamName)}</span>
                        </td>
                        <td>{row.played}</td>
                        <td>{row.wins}</td>
                        <td>{row.draws}</td>
                        <td>{row.losses}</td>
                        <td>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                        <td><b>{row.points}</b></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 관리자 패널 화면
// ─────────────────────────────────────────────────────────────
