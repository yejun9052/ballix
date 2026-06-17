export const predictionTemplates = [
  {
    id: "wc-001",
    type: "일반 경기",
    status: "예측 가능",
    title: "대한민국 vs 일본",
    league: "World Cup",
    matchTime: "2026-06-13T20:00:00",
    homeTeam: "대한민국",
    awayTeam: "일본",
    homeCrest: "https://images.fotmob.com/image_resources/logo/teamlogo/6322.png",
    awayCrest: "https://images.fotmob.com/image_resources/logo/teamlogo/6264.png",
    homeScore: 0,
    awayScore: 0,
    views: 1284,
    comments: 42,
    locked: false,
    odds: { home: 38, draw: 27, away: 35 },
    aiPick: "대한민국 근소 우세",
    aiSummary:
      "최근 폼과 중원 압박 성공률은 한국이 앞서지만, 일본은 전환 속도와 세트피스 완성도가 높아 접전 가능성이 큽니다.",
    factors: ["FIFA 랭킹", "최근 5경기 폼", "예상 라인업", "선수 가치"],
    trend: "+18% 참여 증가",
  },
  {
    id: "wc-002",
    type: "득점 선수",
    status: "라인업 대기",
    title: "브라질 vs 크로아티아 득점자",
    league: "World Cup",
    matchTime: "2026-06-14T04:00:00",
    homeTeam: "브라질",
    awayTeam: "크로아티아",
    homeCrest: "https://images.fotmob.com/image_resources/logo/teamlogo/6380.png",
    awayCrest: "https://images.fotmob.com/image_resources/logo/teamlogo/6397.png",
    homeScore: 0,
    awayScore: 0,
    views: 913,
    comments: 18,
    locked: false,
    odds: { home: 56, draw: 24, away: 20 },
    aiPick: "브라질 우세",
    aiSummary:
      "브라질은 공격진의 개인 전술과 박스 진입 빈도가 높고, 크로아티아는 경기 운영 능력으로 실점 기대값을 낮추는 팀입니다.",
    factors: ["선발 공격수", "슈팅 기대값", "상대 수비 라인", "부상 여부"],
    trend: "득점자 예측 인기",
  },
  {
    id: "wc-003",
    type: "토너먼트",
    status: "진행 예정",
    title: "A조 16강 진출 예측",
    league: "World Cup",
    matchTime: "2026-06-15T00:00:00",
    homeTeam: "A조",
    awayTeam: "상위 2팀",
    homeCrest: "",
    awayCrest: "",
    homeScore: 0,
    awayScore: 0,
    views: 2401,
    comments: 76,
    locked: true,
    odds: { home: 44, draw: 31, away: 25 },
    aiPick: "멕시코 안정권",
    aiSummary:
      "조별리그 일정 난이도와 수비 안정성 기준으로 멕시코가 가장 안정적이며, 2위 경쟁은 득실 관리가 핵심입니다.",
    factors: ["조 편성", "일정 난이도", "득실 기대값", "선수층"],
    trend: "토너먼트 픽",
  },
];

export const competitions = [
  { name: "World Cup", count: 48, active: true },
  { name: "친선 경기", count: 12, active: false },
  { name: "K League", count: 0, active: false },
  { name: "Premier League", count: 0, active: false },
  { name: "LaLiga", count: 0, active: false },
];

export const aiSignals = [
  { label: "모델 신뢰도", value: "82%", tone: "teal" },
  { label: "정배 일치율", value: "64%", tone: "lime" },
  { label: "역배 위험도", value: "High", tone: "coral" },
];

export const featureModules = [
  {
    title: "AI 승률 근거",
    label: "Algorithm",
    description: "FIFA 랭킹, 선수 가치, 최근 폼, 라인업을 합산해 승률과 근거를 정리합니다.",
  },
  {
    title: "예측 템플릿",
    label: "Admin",
    description: "일반 경기, 토너먼트, 득점 선수 예측을 관리자가 직접 등록합니다.",
  },
  {
    title: "실시간 랭킹",
    label: "User",
    description: "정배, 역배, 적중 수를 기준으로 사용자의 예측 점수를 집계합니다.",
  },
  {
    title: "커뮤니티 댓글",
    label: "Community",
    description: "예측마다 의견을 남기고 부적절한 댓글은 AI 검열 후 관리자 검토로 보냅니다.",
  },
];

export const adminWorkflow = [
  { step: "01", title: "날짜 선택", description: "크롤링된 해당 날짜 경기 목록 확인" },
  { step: "02", title: "템플릿 등록", description: "일반 경기·토너먼트·득점 선수 중 선택" },
  { step: "03", title: "수동 보정", description: "팀, 시간, 라인업을 직접 수정 가능" },
  { step: "04", title: "운영 관리", description: "계정 일시정지, 댓글 삭제·복구 관리" },
];

export const roadmap = [
  "월드컵 예측 정식 오픈",
  "유럽 5대 리그 및 K리그 확장",
  "예측 성공 보상: AI 이미지 제공",
  "정배만 찍는 AI 계정 정확도 공개",
  "실제 배포 및 악용 방지 정책 적용",
];

export const standings = [
  { rank: 1, team: "대한민국", played: 0, points: 0, form: "대기" },
  { rank: 2, team: "일본", played: 0, points: 0, form: "대기" },
  { rank: 3, team: "브라질", played: 0, points: 0, form: "대기" },
  { rank: 4, team: "크로아티아", played: 0, points: 0, form: "대기" },
];

export const ranking = [
  { rank: 1, name: "정배요정", points: 1840, accuracy: 72 },
  { rank: 2, name: "언더독헌터", points: 1710, accuracy: 64 },
  { rank: 3, name: "볼잘알", points: 1665, accuracy: 69 },
  { rank: 4, name: "AI추종자", points: 1588, accuracy: 67 },
];

export const comments = [
  {
    id: 1,
    author: "정배요정",
    body: "한국 중원이 초반 압박만 버티면 후반에 기회가 올 것 같아요.",
    createdAt: "방금 전",
  },
  {
    id: 2,
    author: "언더독헌터",
    body: "일본 역습이 무서워서 무승부도 충분히 가능해 보입니다.",
    createdAt: "12분 전",
  },
];

export const adminUsers = [
  {
    id: 1,
    name: "김윤의",
    email: "user@ballix.dev",
    role: "COMMON",
    matchesPlayed: 12,
    correctCount: 8,
    status: "활성",
  },
  {
    id: 2,
    name: "관리자",
    email: "admin@ballix.dev",
    role: "ADMIN",
    matchesPlayed: 0,
    correctCount: 0,
    status: "활성",
  },
  {
    id: 3,
    name: "테스트유저",
    email: "tester@ballix.dev",
    role: "COMMON",
    matchesPlayed: 4,
    correctCount: 1,
    status: "일시정지",
  },
];
