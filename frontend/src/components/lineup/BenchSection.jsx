// 교체 명단(벤치) — 교체 투입/아웃 표시 포함
import { collectPlayerMarks, collectCardsByName, findSubInName, getRatingClass } from "../../utils/lineup.js";
import { PlayerPhoto } from "../common/PlayerPhoto.jsx";
import { PlayerMarks } from "../common/PlayerMarks.jsx";
import { StateMessage } from "../common/StateMessage.jsx";

export function BenchSection({ events, lineup, loading, match }) {
  if (loading) {
    return <StateMessage text="명단을 불러오는 중" />;
  }

  const homeBench = lineup.filter((player) => player.home && !player.starter);
  const awayBench = lineup.filter((player) => !player.home && !player.starter);

  if (homeBench.length === 0 && awayBench.length === 0) {
    return <StateMessage text="교체 명단이 아직 없습니다" />;
  }

  // 교체 투입된 선수(subInMinute 있음)를 위로 정렬
  const sortBench = (list) =>
    [...list].sort((a, b) => {
      const aIn = Number.isFinite(a.subInMinute) ? 0 : 1;
      const bIn = Number.isFinite(b.subInMinute) ? 0 : 1;
      if (aIn !== bIn) {
        return aIn - bIn;
      }
      return (a.subInMinute ?? 0) - (b.subInMinute ?? 0);
    });

  return (
    <div className="bench-grid">
      <BenchList team={match.homeTeam} players={sortBench(homeBench)} events={events} />
      <BenchList team={match.awayTeam} players={sortBench(awayBench)} events={events} />
    </div>
  );
}

export function BenchList({ events, players, team }) {
  return (
    <div className="bench-list">
      <strong>{team}</strong>
      {players.length === 0 ? (
        <span className="bench-empty">명단 없음</span>
      ) : (
        players.map((player) => {
          const marks = collectPlayerMarks(events, player);
          const subIn = Number.isFinite(player.subInMinute) ? player.subInMinute : null;
          const outName = subIn !== null ? findSubInName(events, player) : null;
          const outMarks = outName ? collectCardsByName(events, outName) : null;
          return (
            <span className={`bench-row ${subIn !== null ? "came-in" : ""}`} key={player.id}>
              <PlayerPhoto id={player.fotmobPlayerId} name={player.name} small />
              <span className="bench-name">
                {Number.isFinite(player.shirtNumber) && <b>{player.shirtNumber}</b>}
                {player.name}
                {subIn !== null && (
                  <span className="sub-info-in">
                    <em className="bench-in">↑{subIn}'</em>
                    {outName && (
                      <span className="bench-out-row">
                        <em className="bench-out-name">↓{outName}</em>
                        {outMarks?.yellow > 0 && <span className="mark card yellow legend-card" title="옐로카드" />}
                        {outMarks?.red > 0 && <span className="mark card red legend-card" title="레드카드" />}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <PlayerMarks marks={marks} />
              {Number.isFinite(player.rating) && (
                <span className={`rating-chip ${getRatingClass(player.rating)}`}>{player.rating}</span>
              )}
            </span>
          );
        })
      )}
    </div>
  );
}

