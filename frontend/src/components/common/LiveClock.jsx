// 라이브 경기 진행시간 시계 — liveStartedAt 앵커 기준으로 매초 흐름
import { useTicker } from "../../hooks/useTicker.js";
import { FOTMOB_SSR_DELAY_COMPENSATION_SECONDS } from "../../utils/constants.js";

export function LiveClock({ match }) {
  const raw = match.raw || match;
  const label = raw.liveTime;
  const anchor = raw.liveStartedAt;
  const isPlaying = raw.status === "IN_PLAY";
  // 숫자 라벨(67' 등)이고 앵커가 있으면 매초 흐른다. HT/FT 등은 라벨 고정.
  const ticking = Boolean(isPlaying && anchor && label && /\d/.test(label));
  const now = useTicker(ticking);

  if (!isPlaying) {
    return null;
  }
  if (!label) {
    return <span className="live-clock">● 진행 중</span>;
  }

  let text = label;
  if (ticking) {
    const elapsed =
      Math.max(0, Math.floor((now - new Date(anchor).getTime()) / 1000)) +
      FOTMOB_SSR_DELAY_COMPENSATION_SECONDS;
    const minute = Math.floor(elapsed / 60);
    const second = elapsed % 60;
    text = `${minute}:${String(second).padStart(2, "0")}`;
  }

  return <span className="live-clock">● {text}</span>;
}

