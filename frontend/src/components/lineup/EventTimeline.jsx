// 주요 이벤트 타임라인 — 골/카드/교체를 시간순으로 표시
import { eventIcon, eventDetailText } from "../../utils/lineup.js";
import { StateMessage } from "../common/StateMessage.jsx";

export function EventTimeline({ events, loading, match }) {
  if (loading) {
    return <StateMessage text="이벤트를 불러오는 중" />;
  }
  if (events.length === 0) {
    return <StateMessage text="기록된 이벤트가 없습니다" />;
  }

  const sorted = [...events].sort((a, b) => {
    const minuteA = (a.minute ?? 0) + (a.addedTime ?? 0) / 100;
    const minuteB = (b.minute ?? 0) + (b.addedTime ?? 0) / 100;
    return minuteA - minuteB;
  });

  return (
    <ul className="event-timeline">
      {sorted.map((event) => {
        const minuteText = event.addedTime
          ? `${event.minute}+${event.addedTime}'`
          : `${event.minute}'`;
        return (
          <li className={`event-timeline-row ${event.home ? "home" : "away"}`} key={event.id}>
            <span className="event-minute">{minuteText}</span>
            <span className="event-icon">{eventIcon(event)}</span>
            <span className="event-text">
              <strong>{event.playerName}</strong>
              <em>{eventDetailText(event)}</em>
            </span>
            <span className="event-team">{event.home ? match.homeTeam : match.awayTeam}</span>
          </li>
        );
      })}
    </ul>
  );
}

