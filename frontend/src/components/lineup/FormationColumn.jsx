// 포메이션 컬럼 — 좌표 없는 경기의 라인업 폴백(팀별 세로 목록)
import { collectPlayerMarks, getPlayerLayout, getRatingClass } from "../../utils/lineup.js";
import { PlayerPhoto } from "../common/PlayerPhoto.jsx";
import { PlayerMarks } from "../common/PlayerMarks.jsx";

export function FormationColumn({ events, formation, players, title, onSelect }) {
  return (
    <div className="formation-column">
      <div className="formation-column-head">
        <strong>{title}</strong>
        {formation && <span>{formation}</span>}
      </div>
      <div className="formation-column-list">
        {players.map((player) => {
          const marks = collectPlayerMarks(events, player);
          const subOut = Number.isFinite(player.subOutMinute) ? player.subOutMinute : null;
          const layout = getPlayerLayout(player);
          const clickable = onSelect && player.fotmobPlayerId;
          return (
            <div
              className={`formation-row ${clickable ? "is-clickable" : ""}`}
              key={player.id}
              onClick={clickable ? () => onSelect(player) : undefined}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onSelect(player) : undefined}
            >
              <PlayerPhoto id={player.fotmobPlayerId} name={player.name} small />
              <span className="formation-row-name">
                {Number.isFinite(player.shirtNumber) && <b>{player.shirtNumber}</b>}
                {player.name}
                {layout?.label && <em className="pos-inline">{layout.label}</em>}
              </span>
              {subOut !== null && <span className="sub-inline out">↓{subOut}'</span>}
              <span className="formation-row-badges">
                <PlayerMarks marks={marks} />
              </span>
              {Number.isFinite(player.rating) && (
                <span className={`rating-chip ${getRatingClass(player.rating)}`}>{player.rating}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


