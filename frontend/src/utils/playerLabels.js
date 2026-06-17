// 선수 상세(FotMob 영문 라벨) → 한국어 표기 매핑. 매핑에 없으면 원문 그대로 둔다.

const LABEL_KR = {
  // 프로필(playerInformation)
  Height: "키",
  Weight: "몸무게",
  Age: "나이",
  Country: "국적",
  Nationality: "국적",
  Shirt: "등번호",
  "Shirt number": "등번호",
  "Preferred foot": "주발",
  "Market value": "시장 가치",
  "Primary position": "주 포지션",
  Position: "포지션",
  Caps: "A매치",
  "Caps / Goals": "A매치/골",
  Contract: "계약",
  "Contract expiry": "계약 만료",
  "Contract until": "계약 만료",
  "National team": "국가대표",
  // 시즌 스탯(mainLeague.stats)
  Matches: "경기수",
  "Matches played": "경기수",
  Appearances: "출전",
  Goals: "골",
  Assists: "도움",
  "Goals + Assists": "골+도움",
  "FotMob rating": "평점",
  Rating: "평점",
  Started: "선발 출전",
  "Minutes played": "출전 시간",
  Minutes: "출전 시간",
  "Yellow cards": "옐로카드",
  "Red cards": "레드카드",
  "Clean sheets": "클린시트",
  "Goals conceded": "실점",
  Saves: "선방",
  "Penalties saved": "PK 선방",
  Shots: "슈팅",
  "Shots on target": "유효 슈팅",
  "Pass accuracy": "패스 정확도",
  "Chances created": "기회 창출",
  "Big chances created": "결정적 기회 창출",
  "Successful dribbles": "드리블 성공",
  Tackles: "태클",
  Interceptions: "인터셉트",
  // 경기별 상세(content.playerStats) — 위에 이미 있는 키는 제외
  "Top stats": "주요 스탯",
  Touches: "터치",
  "Accurate long balls": "정확한 롱볼",
  "Long ball accuracy": "롱볼 정확도",
  "Passes into final third": "전방 패스",
  Recoveries: "볼 회수",
  Clearances: "걷어내기",
  "Defensive actions": "수비 액션",
  "Was fouled": "피파울",
  "Fouls committed": "파울",
  Fouls: "파울",
  "Ground duels won": "지상 경합 승리",
  "Aerial duels won": "공중 경합 승리",
  "Duels won": "경합 승리",
  "Dribbled past": "드리블 허용",
  Dispossessed: "볼 빼앗김",
  "Expected goals (xG)": "기대 득점(xG)",
  "Expected assists (xA)": "기대 도움(xA)",
  xG: "기대 득점(xG)",
  "Blocked shots": "막힌 슈팅",
  "Big chances missed": "결정적 기회 실패",
  Offsides: "오프사이드",
  "xGOT faced": "피xGOT",
  "Goals prevented": "실점 방지",
  "Diving save": "다이빙 선방",
  "Saves inside box": "박스 안 선방",
  "Acted as sweeper": "스위퍼 처리",
  Punches: "펀칭",
  Throws: "스로",
  "High claim": "하이볼 처리",
};

// 일부 값도 한국어로(주발 등). 그 외는 원문 유지.
const VALUE_KR = {
  Left: "왼발",
  Right: "오른발",
  Both: "양발",
};

export function krLabel(label) {
  if (label == null) return "";
  return LABEL_KR[label] || label;
}

export function krValue(label, value) {
  const v = String(value ?? "");
  if (label === "Preferred foot" || label === "주발") {
    return VALUE_KR[v] || v;
  }
  return v;
}
