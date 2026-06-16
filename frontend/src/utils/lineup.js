// 라인업/이벤트 계산 — 선수-이벤트 매칭, 피치 좌표, 평점 등급, 이벤트 아이콘

export function samePlayerId(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

// FotMob 이벤트 이름은 "Zwane" / "T. Zwane" / "Themba Zwane" 등 축약 가능
// 1) 정확 일치  2) 같은팀 내 성(last word) 일치  3) 이벤트명이 선수명에 포함

export function playerNameMatchesEvent(eventName, playerName, eventIsHome, playerIsHome) {
  if (!eventName || !playerName) return false;
  const en = eventName.toLowerCase().trim();
  const pn = playerName.toLowerCase().trim();
  if (en === pn) return true;
  // 팀사이드가 명확히 다르면 제외 (false-positive 방지)
  if (eventIsHome != null && playerIsHome != null && eventIsHome !== playerIsHome) return false;
  // 성(마지막 단어) 일치 — 3자 이상만 허용
  const eLast = en.split(" ").pop();
  const pLast = pn.split(" ").pop();
  if (eLast && pLast && eLast.length > 3 && eLast === pLast) return true;
  // 이벤트명이 선수 전체이름에 포함되거나, 선수성명이 이벤트명에 포함
  if (pn.includes(en) || en.includes(pn)) return true;
  return false;
}


export function collectPlayerMarks(events, player) {
  const marks = { goals: 0, assists: 0, yellow: 0, red: 0 };
  if (!player) return marks;
  const pid = player.fotmobPlayerId;
  const pname = player.name;
  for (const event of events) {
    const eid = event.fotmobPlayerId;
    if (event.type === "GOAL") {
      if (pid != null && samePlayerId(eid, pid)) {
        marks.goals += 1;
      } else {
        const assistName = event.detail?.startsWith("assist by ")
          ? event.detail.slice(10)
          : event.detail;
        if (assistName && assistName === pname) {
          marks.assists += 1;
        }
      }
    } else if (event.type === "CARD") {
      // 카드 이벤트에 선수 ID가 있으면 ID로만 매칭한다.
      // (이름/성 매칭은 동명이인·같은 성에서 오탐 → 카드 안 받은 선수에게 표시되는 버그)
      // 이름 폴백은 이벤트에 ID가 아예 없을 때만 사용한다.
      const eventHasId = eid != null;
      const idMatch = eventHasId && samePlayerId(eid, pid);
      const nameMatch = !eventHasId &&
        playerNameMatchesEvent(event.playerName, pname, event.home, player.home);
      if (idMatch || nameMatch) {
        if (event.detail === "Red" || event.detail === "YellowRed") marks.red += 1;
        else marks.yellow += 1;
      }
    }
  }
  return marks;
}


export function collectCardsByName(events, name) {
  const marks = { yellow: 0, red: 0 };
  if (!name) return marks;
  for (const ev of events) {
    if (ev.type !== "CARD") continue;
    if (!playerNameMatchesEvent(ev.playerName, name, null, null)) continue;
    if (ev.detail === "Red" || ev.detail === "YellowRed") marks.red += 1;
    else marks.yellow += 1;
  }
  return marks;
}

// 이 선수가 교체로 들어왔을 때, 누구 대신 들어왔는지(SUB 이벤트 detail="out:이름")

export function findSubInName(events, player) {
  const pid = player.fotmobPlayerId;
  if (pid == null) return null;
  const event = events.find(
    (item) => item.type === "SUB" && samePlayerId(item.fotmobPlayerId, pid),
  );
  if (event?.detail?.startsWith("out:")) {
    return event.detail.slice(4);
  }
  return null;
}

// FotMob positionId = [라인][좌우]. 라인=깊이, 끝자리=좌우(1~9, 5=중앙).
// 예) 11=GK, 33/35/37=수비, 51/59=윙백, 72/74/76/78=미드, 103/115=공격

export const DEPTH_BY_LINE = {
  1: 0.05,
  2: 0.16,
  3: 0.26,
  4: 0.34,
  5: 0.44,
  6: 0.52,
  7: 0.62,
  8: 0.72,
  9: 0.8,
  10: 0.88,
  11: 0.95,
};

// posX(깊이) + posY(좌우: 0=오른쪽, 1=왼쪽) → 상세 포지션 라벨

export function getDetailedLabel(depth, lateral) {
  const isR = lateral < 0.28;
  const isL = lateral > 0.72;

  if (depth < 0.1)  return "GK";

  if (depth < 0.37) {                        // 수비 라인
    if (isR) return "RB";
    if (isL) return "LB";
    return "CB";
  }

  if (depth < 0.67) {                        // 미드필드 라인
    if (isR) return "RM";
    if (isL) return "LM";
    if (depth < 0.49) return "CDM";
    if (depth > 0.57) return "CAM";
    return "CM";
  }

  // 공격 라인
  if (isR) return "RW";
  if (isL) return "LW";
  return "ST";
}

// 선수의 피치 배치 좌표 + 포지션 라벨을 구한다.
// posX/posY가 있으면 그대로, 없으면 positionId로 역산.

export function getPlayerLayout(player) {
  if (!player) {
    return null;
  }
  if (Number.isFinite(player.posX) && Number.isFinite(player.posY)) {
    const depth = player.posX;
    // FotMob posY는 positionId 좌우 기준과 미러링돼 있다(예: 우측 RB가 posY≈0.875).
    // positionId 경로(종료 경기, 정상)와 좌우를 맞추기 위해 1 - posY로 뒤집는다.
    const lateral = 1 - player.posY;
    return { depth, lateral, label: getDetailedLabel(depth, lateral) };
  }
  if (Number.isFinite(player.positionId)) {
    const line = Math.floor(player.positionId / 10);
    const digit = player.positionId % 10;
    const depth = DEPTH_BY_LINE[line] ?? 0.5;
    const lateral = line === 1 || digit === 0 ? 0.5 : (digit - 1) / 8;
    return { depth, lateral, label: getDetailedLabel(depth, lateral) };
  }
  return null;
}

// 포메이션 문자열 유효성 검증 (합이 10인 X-Y-Z... 형식인지)

export function isValidFormation(f) {
  if (!f || typeof f !== "string") return false;
  const parts = f.split("-");
  if (parts.length < 2 || parts.length > 5) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n <= 0 || n >= 10)) return false;
  const total = nums.reduce((a, b) => a + b, 0);
  return total >= 9 && total <= 11;
}

// 선발 선수들의 posX(우선) 또는 positionId로 포메이션 문자열을 역산 (DEF/MID/ATT 3분할)


export function getRatingClass(rating) {
  if (!Number.isFinite(rating)) return "";
  if (rating >= 8) return "rating-high";
  if (rating >= 6) return "rating-mid";
  return "rating-low";
}


export function eventIcon(event) {
  if (event.type === "GOAL") {
    return "⚽";
  }
  if (event.type === "CARD") {
    return event.detail === "Red" || event.detail === "YellowRed" ? "🟥" : "🟨";
  }
  if (event.type === "SUB") {
    return "↔";
  }
  return "•";
}


export function eventDetailText(event) {
  if (event.type === "GOAL") {
    if (!event.detail) return "골";
    const assistName = event.detail.startsWith("assist by ")
      ? event.detail.slice(10)
      : event.detail;
    return `어시스트 ${assistName}`;
  }
  if (event.type === "CARD") {
    if (event.detail === "Red") return "레드카드";
    if (event.detail === "YellowRed") return "레드카드 (경고 누적)";
    return "옐로카드";
  }
  if (event.type === "SUB") {
    return event.detail?.startsWith("out:")
      ? `교체 (${event.detail.slice(4)} OUT)`
      : "교체";
  }
  return "";
}

// ─────────────────────────────────────────────────────────────
// 승부예측 (predict + ratio)
// ─────────────────────────────────────────────────────────────
