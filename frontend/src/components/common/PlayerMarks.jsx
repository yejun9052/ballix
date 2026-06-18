// 선수 마크 — 골/어시스트/옐로·레드카드 아이콘 묶음
import { memo } from "react";

export const PlayerMarks = memo(function PlayerMarks({ marks }) {
  const hasGoals = marks.goals > 0 || marks.assists > 0;
  const hasCards = marks.yellow > 0 || marks.red > 0;
  if (!hasGoals && !hasCards) return null;
  return (
    <>
      {hasCards && (
        <span className="player-marks cards">
          {marks.yellow > 0 && <span className="mark card yellow" title="옐로카드" />}
          {marks.red > 0 && <span className="mark card red" title="레드카드" />}
        </span>
      )}
      {hasGoals && (
        <span className="player-marks goals">
          {marks.goals > 0 && (
            <span className="mark goal" title={`골 ${marks.goals}`}>
              ⚽{marks.goals > 1 && <b className="mark-count">×{marks.goals}</b>}
            </span>
          )}
          {marks.assists > 0 && (
            <span className="mark assist" title={`어시스트 ${marks.assists}`}>
              🅰️{marks.assists > 1 && <b className="mark-count">×{marks.assists}</b>}
            </span>
          )}
        </span>
      )}
    </>
  );
});
