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
          {Array.from({ length: marks.goals }).map((_, i) => (
            <span className="mark goal" key={`g${i}`} title="골">⚽</span>
          ))}
          {Array.from({ length: marks.assists }).map((_, i) => (
            <span className="mark assist" key={`a${i}`} title="어시스트">🅰️</span>
          ))}
        </span>
      )}
    </>
  );
});
