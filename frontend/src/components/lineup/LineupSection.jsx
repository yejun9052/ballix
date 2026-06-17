// 선발 라인업 섹션 — 좌표 있으면 피치, 없으면 포메이션 컬럼으로 렌더
import { useIsNarrow } from "../../hooks/useIsNarrow.js";
import { getPlayerLayout, isValidFormation } from "../../utils/lineup.js";
import { TeamCrest } from "../common/TeamCrest.jsx";
import { StateMessage } from "../common/StateMessage.jsx";
import { PitchPlayer } from "./PitchPlayer.jsx";
import { FormationColumn } from "./FormationColumn.jsx";

export function LineupSection({ awayFormation, error, events, homeFormation, lineup, loading, match, onSelectPlayer }) {
  const isNarrow = useIsNarrow();

  if (loading) {
    return <StateMessage text="라인업을 불러오는 중" />;
  }
  if (error) {
    return <StateMessage text={error} />;
  }

  const starters = lineup.filter((player) => player.starter);
  if (starters.length === 0) {
    return (
      <StateMessage text="라인업이 아직 공개되지 않았습니다 (보통 킥오프 1시간 전 공개)" />
    );
  }

  const homeStarters = starters.filter((player) => player.home);
  const awayStarters = starters.filter((player) => !player.home);
  const hasCoords = starters.some((player) => getPlayerLayout(player) !== null);
  const homeFormationLabel = isValidFormation(homeFormation) ? homeFormation : "";
  const awayFormationLabel = isValidFormation(awayFormation) ? awayFormation : "";

  return (
    <div className="lineup-card">
      <div className="lineup-top">
        <div>
          <TeamCrest crest={match.homeCrest} name={match.homeTeam} size="flag" />
          <strong>{match.homeTeam}</strong>
          {homeFormationLabel && <b>{homeFormationLabel}</b>}
        </div>
        <div>
          {awayFormationLabel && <b>{awayFormationLabel}</b>}
          <strong>{match.awayTeam}</strong>
          <TeamCrest crest={match.awayCrest} name={match.awayTeam} size="flag" />
        </div>
      </div>

      {hasCoords ? (
        <div
          className={`pitch-board pitch-abs ${isNarrow ? "is-vertical" : ""}`}
          aria-label={`${match.homeTeam} ${match.awayTeam} 선발 라인업`}
        >
          <div className="pitch-mark halfway" aria-hidden="true" />
          <div className="pitch-mark center-circle" aria-hidden="true" />
          <div className="pitch-box left-box" aria-hidden="true" />
          <div className="pitch-box right-box" aria-hidden="true" />
          {homeStarters.map((player) => (
            <PitchPlayer
              key={`h-${player.id}`}
              player={player}
              events={events}
              side="home"
              vertical={isNarrow}
              onSelect={onSelectPlayer}
            />
          ))}
          {awayStarters.map((player) => (
            <PitchPlayer
              key={`a-${player.id}`}
              player={player}
              events={events}
              side="away"
              vertical={isNarrow}
              onSelect={onSelectPlayer}
            />
          ))}
        </div>
      ) : (
        <div className="lineup-fallback">
          <FormationColumn
            title={match.homeTeam}
            formation={homeFormationLabel}
            players={homeStarters}
            events={events}
            onSelect={onSelectPlayer}
          />
          <FormationColumn
            title={match.awayTeam}
            formation={awayFormationLabel}
            players={awayStarters}
            events={events}
            onSelect={onSelectPlayer}
          />
        </div>
      )}
    </div>
  );
}

