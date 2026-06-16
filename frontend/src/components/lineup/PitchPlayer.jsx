// 피치 선수 마커 — posX/posY 좌표로 절대 배치, 사진·평점·마크·교체 표시
import { collectPlayerMarks, getPlayerLayout, getRatingClass } from "../../utils/lineup.js";
import { PlayerPhoto } from "../common/PlayerPhoto.jsx";
import { PlayerMarks } from "../common/PlayerMarks.jsx";

export function PitchPlayer({ events, player, side, vertical = false }) {
  const marks = collectPlayerMarks(events, player);
  const layout = getPlayerLayout(player) || { depth: 0.5, lateral: 0.5, label: "" };
  // depth: 0(자기 골대)~1(상대 골대 방향), lateral: 0~1 좌우.
  let left;
  let top;
  if (vertical) {
    // 세로 피치: home=위(아래 공격), away=아래(위 공격)
    // away는 공격 방향이 반대라 lateral(posY)를 미러링해야 좌우가 맞음
    left = side === "home" ? 12 + layout.lateral * 76 : 12 + (1 - layout.lateral) * 76;
    top = side === "home" ? 4 + layout.depth * 44 : 96 - layout.depth * 44;
  } else {
    // 가로 피치: home=왼(오른 공격), away=오른(왼 공격)
    // home은 공격 방향이 오른쪽이라 posY 기준 top이 스크린 하단 → 미러링
    left = side === "home" ? 3 + layout.depth * 44 : 97 - layout.depth * 44;
    top = side === "home" ? 10 + (1 - layout.lateral) * 80 : 10 + layout.lateral * 80;
  }
  const subOut = Number.isFinite(player.subOutMinute) ? player.subOutMinute : null;
  const position = layout.label;

  return (
    <div className={`pitch-player abs ${side}`} style={{ left: `${left}%`, top: `${top}%` }}>
      <div className="player-photo-wrap">
        <PlayerPhoto id={player.fotmobPlayerId} name={player.name} />
        <PlayerMarks marks={marks} />
        {Number.isFinite(player.rating) && (
          <span className={`rating-chip pitch-rating ${getRatingClass(player.rating)}`}>{player.rating}</span>
        )}
      </div>
      <div className="pitch-info" title={player.name || ""}>
        <div className="pitch-name">
          {Number.isFinite(player.shirtNumber) && <span>{player.shirtNumber}</span>}
          <strong>{(player.name || "").split(" ").pop()}</strong>
        </div>
        {subOut !== null && (
          <span className="sub-badge out pitch-sub" title={`${subOut}분 교체 아웃`}>
            ↓{subOut}'
          </span>
        )}
        {position && <span className="pos-tag">{position}</span>}
      </div>
    </div>
  );
}

