// 라이브 경기 진행시간 시계 — liveStartedAtMs(절대시각) 앵커 기준으로 매초 흐름.
// 정지(하프타임 등)는 백엔드 clockRunning=false 로 알려주므로 그때 시계를 멈추고 라벨만 표시한다.
import { useTicker } from "../../hooks/useTicker.js";
import {
  LIVE_CLOCK_LAG_SECONDS,
  STOPPAGE_GRACE_SECONDS,
  MAX_STOPPAGE_SECONDS,
} from "../../utils/constants.js";

export function LiveClock({ match }) {
  const raw = match.raw || match;
  const label = raw.liveTime;
  const isPlaying = raw.status === "IN_PLAY";

  // 절대시각(epoch millis) 우선 — 타임존 해석이 끼지 않아 어느 환경에서도 정확.
  // 없으면 liveStartedAt(LocalDateTime 문자열) 폴백.
  const anchorMs =
    raw.liveStartedAtMs != null
      ? raw.liveStartedAtMs
      : raw.liveStartedAt
        ? new Date(raw.liveStartedAt).getTime()
        : null;

  // 시계가 흐르는지 판정 — 백엔드 clockRunning 이 최우선(HT 등 정지면 false).
  // 값이 없으면(구버전 API) 앵커+숫자라벨로 추론.
  const running =
    raw.clockRunning != null
      ? raw.clockRunning
      : Boolean(anchorMs && label && /\d/.test(label));
  const ticking = Boolean(isPlaying && running && anchorMs);
  const now = useTicker(ticking);

  if (!isPlaying) {
    return null;
  }
  if (!label) {
    return <span className="live-clock">● 진행 중</span>;
  }
  // 정지 구간(HT/Break/Pen. 등): 시계 멈추고 라벨만 표시
  if (!ticking) {
    return <span className="live-clock">● {label}</span>;
  }

  // 정규시간 끝(base, 전반45/후반90)은 FotMob 권위값(liveBasePeriod) 우선 — 라벨 추측 X(1차 스토피지 오판 방지).
  // 없으면(구버전) 라벨 선행 숫자로 폴백.
  let base = raw.liveBasePeriod;
  if (base !== 45 && base !== 90) {
    const lead = parseInt(label, 10);
    base = Number.isFinite(lead) && lead > 45 ? 90 : 45;
  }
  // 부여 추가시간(addedTime) — 프론트가 "+N"을 임의로 증가시키지 않고 **DB값을 그대로** 쓴다.
  // FotMob 라이브 부여 추가시간(liveAddedTime) 우선, 없으면 하프별 추가시간 필드(AddedTime 이벤트 파생).
  const announced = raw.liveAddedTime;
  const halfCap = base === 45 ? raw.firstHalfAddedTime : raw.secondHalfAddedTime;
  const addedMinutes =
    announced != null && announced > 0
      ? announced
      : halfCap != null && halfCap > 0
        ? halfCap
        : null;

  // 시계를 LIVE_CLOCK_LAG_SECONDS 만큼 의도적으로 늦춰, 폴링+지연으로 늦게 들어오는 골·스코어와 맞춘다.
  const rawElapsed = Math.max(
    0,
    Math.floor((now - anchorMs) / 1000) - LIVE_CLOCK_LAG_SECONDS,
  );
  // 스토피지 상한 — 시계가 부여 추가시간을 넘겨 무한정 흐르지 않도록 멈춘다(데이터 지연/스크래퍼 다운 안전장치).
  // 부여 추가시간을 알면 base+N+GRACE, 모르면 base+MAX 에서 정지. (신선한 HT/FT가 오면 위에서 이미 정지함)
  let elapsed = rawElapsed;
  if (Math.floor(rawElapsed / 60) >= base) {
    const capStoppage =
      addedMinutes != null && addedMinutes > 0
        ? addedMinutes * 60 + STOPPAGE_GRACE_SECONDS
        : MAX_STOPPAGE_SECONDS;
    elapsed = Math.min(rawElapsed, base * 60 + capStoppage);
  }
  const minute = Math.floor(elapsed / 60);
  const second = elapsed % 60;

  const mmss = `${minute}:${String(second).padStart(2, "0")}`;
  let text;
  if (minute < base) {
    // 정규 시간(전반 ~45, 후반 ~90): mm:ss 로 매초 흐름
    text = mmss;
  } else {
    // 추가시간 구간: 시계는 계속 흐르고(mm:ss), 부여 추가시간(DB값)을 "+N"으로 뒤에만 붙인다.
    // 예) 후반 추가 5분이면 "90:34 +5" → "91:20 +5" … (N은 고정, 시간만 흐름)
    text = addedMinutes != null ? `${mmss} +${addedMinutes}` : mmss;
  }

  return <span className="live-clock">● {text}</span>;
}
