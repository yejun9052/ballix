import { BarChart3, Chrome, Moon, ShieldCheck, Sun, Trophy, UsersRound } from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import { adminApi, ApiError, authApi, fotmobAdminApi, matchApi, noticeApi, predictionApi, standingsApi, userApi } from "./services/api";

const loginBenefits = [
  {
    icon: BarChart3,
    title: "AI 승률 근거",
    text: "FIFA 랭킹, 라인업, 최근 폼을 합산한 예측 설명을 확인합니다.",
  },
  {
    icon: Trophy,
    title: "승부예측 참여",
    text: "크롤링된 실제 경기에서 홈 승, 무승부, 원정 승 중 하나를 선택합니다.",
  },
  {
    icon: UsersRound,
    title: "랭킹과 커뮤니티",
    text: "정답률 기반 랭킹을 확인하고 예측별 결과로 의견을 나눕니다.",
  },
];

const fallbackPrediction = { home: 34, draw: 33, away: 33 };

const statusLabels = {
  SCHEDULED: "예정",
  IN_PLAY: "진행 중",
  FINISHED: "종료",
  CANCELLED: "취소",
};

const winnerLabels = {
  HOME_TEAM: "홈 승",
  DRAW: "무승부",
  AWAY_TEAM: "원정 승",
};

const WORLD_CUP_LEAGUE_ID = 77;
const LEADERBOARD_MIN_MATCHES = 5;
// 메인 일정은 현재 클라이언트에서 한 번에 전부 받아 프론트에서 필터링한다.
// TODO: DB 경기 수가 이 값을 넘으면 누락된다 → 서버측 필터/페이지네이션으로 전환 필요.
const MATCH_LIST_FETCH_SIZE = 500;

const aiFallback = {
  aiPick: "AI 분석 대기",
  aiReason:
    "이 경기는 아직 관리자가 AI 승률 예측 대상으로 선택하지 않았습니다. 선택되면 홈/무/원정 확률과 근거가 표시됩니다.",
};

function getPageContent(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.content)) {
    return data.content;
  }

  return [];
}

const countryNameKo = {
  Afghanistan: "아프가니스탄",
  Algeria: "알제리",
  Andorra: "안도라",
  Argentina: "아르헨티나",
  Australia: "호주",
  Austria: "오스트리아",
  Belgium: "벨기에",
  "Bosnia and Herzegovina": "보스니아 헤르체고비나",
  Brazil: "브라질",
  Bulgaria: "불가리아",
  Canada: "캐나다",
  "Cape Verde": "카보베르데",
  Colombia: "콜롬비아",
  Croatia: "크로아티아",
  Curacao: "퀴라소",
  Czechia: "체코",
  "DR Congo": "DR콩고",
  Ecuador: "에콰도르",
  Egypt: "이집트",
  England: "잉글랜드",
  Finland: "핀란드",
  France: "프랑스",
  Gambia: "감비아",
  Germany: "독일",
  Ghana: "가나",
  Haiti: "아이티",
  Iceland: "아이슬란드",
  India: "인도",
  Iran: "이란",
  Iraq: "이라크",
  "Ivory Coast": "코트디부아르",
  Jamaica: "자메이카",
  Japan: "일본",
  Jordan: "요르단",
  Kosovo: "코소보",
  Maldives: "몰디브",
  Malta: "몰타",
  Mexico: "멕시코",
  Mongolia: "몽골",
  Montenegro: "몬테네그로",
  Morocco: "모로코",
  Netherlands: "네덜란드",
  "New Zealand": "뉴질랜드",
  Nicaragua: "니카라과",
  Nigeria: "나이지리아",
  "North Macedonia": "북마케도니아",
  Norway: "노르웨이",
  Panama: "파나마",
  Paraguay: "파라과이",
  Poland: "폴란드",
  Portugal: "포르투갈",
  Qatar: "카타르",
  "Saudi Arabia": "사우디아라비아",
  Scotland: "스코틀랜드",
  Senegal: "세네갈",
  Serbia: "세르비아",
  Singapore: "싱가포르",
  Slovakia: "슬로바키아",
  "South Africa": "남아프리카공화국",
  "South Korea": "대한민국",
  Spain: "스페인",
  Sweden: "스웨덴",
  Switzerland: "스위스",
  Tunisia: "튀니지",
  Turkiye: "튀르키예",
  Ukraine: "우크라이나",
  Uruguay: "우루과이",
  USA: "미국",
  Uzbekistan: "우즈베키스탄",
  Zimbabwe: "짐바브웨",
};

const competitionFilters = [
  { label: "전체", value: "all" },
  { label: "월드컵", value: "worldcup" },
  { label: "친선", value: "friendly" },
  { label: "PL", value: "pl" },
];

const aiFilters = [
  { label: "전체", value: "all" },
  { label: "AI 승률 있음", value: "with" },
  { label: "AI 승률 없음", value: "without" },
];

function getTeamName(team) {
  const originalName = team?.name || team?.shortName || "TBD";
  return countryNameKo[originalName] || countryNameKo[team?.shortName] || originalName;
}

function getTeamNameByOriginal(originalName) {
  if (!originalName) {
    return "TBD";
  }
  return countryNameKo[originalName] || originalName;
}

const KST_TIME_ZONE = "Asia/Seoul";

// 백엔드 matchTime은 타임존 표기 없는 KST 벽시계("2026-06-15T05:00:00").
// 브라우저 타임존과 무관하게 같은 순간을 가리키도록 +09:00을 보정해 파싱한다.
function parseKstDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value) {
    return null;
  }
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMatchDateTime(matchTime) {
  const date = parseKstDate(matchTime);
  if (!date) {
    return matchTime ? String(matchTime) : "일정 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function isToday(matchTime) {
  const date = parseKstDate(matchTime);
  if (!date) {
    return false;
  }
  return formatDateInputValue(date) === formatDateInputValue(new Date());
}

function getMatchScore(match) {
  if (!["IN_PLAY", "FINISHED"].includes(match.status)) {
    return "";
  }

  return `${match.homeScore ?? 0} : ${match.awayScore ?? 0}`;
}

function normalizeMatch(match) {
  const homeTeam = getTeamName(match.homeTeam);
  const awayTeam = getTeamName(match.awayTeam);
  const hasAiPrediction =
    Number.isFinite(match.aiHomePct) &&
    Number.isFinite(match.aiDrawPct) &&
    Number.isFinite(match.aiAwayPct);

  return {
    id: match.id,
    raw: match,
    category: match.competition?.name || "대회 미정",
    homeTeam,
    awayTeam,
    homeTeamOriginal: match.homeTeam?.name || homeTeam,
    awayTeamOriginal: match.awayTeam?.name || awayTeam,
    homeCrest: match.homeTeam?.crest || "",
    awayCrest: match.awayTeam?.crest || "",
    matchTime: formatMatchDateTime(match.matchTime),
    matchTimeRaw: match.matchTime,
    venue: match.venue || "경기장 미정",
    group: match.groupName || match.stage || "일정",
    status: statusLabels[match.status] || match.status || "상태 미정",
    statusRaw: match.status,
    score: getMatchScore(match),
    prediction: hasAiPrediction
      ? {
          home: match.aiHomePct,
          draw: match.aiDrawPct,
          away: match.aiAwayPct,
        }
      : fallbackPrediction,
    aiPick: match.predictionEnabled ? "AI 승률 생성 완료" : aiFallback.aiPick,
    aiReason: match.aiSummary || aiFallback.aiReason,
    hasAiPrediction,
    predictionEnabled: Boolean(match.predictionEnabled),
    isWorldCup:
      match.fotmobLeagueId === WORLD_CUP_LEAGUE_ID ||
      match.competition?.fotmobLeagueId === WORLD_CUP_LEAGUE_ID,
  };
}

function getCompetitionFilterValue(match) {
  const leagueId = match.raw?.competition?.fotmobLeagueId;
  const name = match.category.toLowerCase();

  if (leagueId === 77 || name.includes("world cup")) {
    return "worldcup";
  }

  if (leagueId === 114 || name.includes("friendly") || name.includes("friendlies")) {
    return "friendly";
  }

  if (leagueId === 47 || name.includes("premier league") || name === "pl") {
    return "pl";
  }

  return "other";
}

function formatDateInputValue(matchTime) {
  const date = parseKstDate(matchTime);
  if (!date) {
    return "";
  }

  // en-CA 로케일은 YYYY-MM-DD 형식을 준다. KST 기준으로 날짜를 뽑는다.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getGroupLabel(group) {
  const groupCode =
    group.match(/grp\.?\s*([A-L])/i)?.[1] ||
    group.match(/group\s*([A-L])/i)?.[1] ||
    group.match(/^([A-L])$/i)?.[1];

  return groupCode ? `${groupCode.toUpperCase()}조` : group;
}

function getGroupSortValue(group) {
  const label = getGroupLabel(group);
  const groupCode = label.match(/^([A-L])조$/)?.[1];
  return groupCode || label;
}

// 목록 정렬: 진행 중(시간순) → 나머지 날짜순·시간순
function compareMatches(a, b) {
  const aLive = a.statusRaw === "IN_PLAY";
  const bLive = b.statusRaw === "IN_PLAY";
  if (aLive !== bLive) return aLive ? -1 : 1;
  return new Date(a.matchTimeRaw).getTime() - new Date(b.matchTimeRaw).getTime();
}

// ─────────────────────────────────────────────────────────────
// 라이브 시계 (liveStartedAt 앵커 → 클라이언트에서 초 단위로 흐름)
// ─────────────────────────────────────────────────────────────
// FotMob SSR 스냅샷은 실제 경기 진행시간보다 몇 분 지연된다. 화면 시계가
// 실제와 가깝게 보이도록 앵커 경과초에 이만큼 더해 보정한다.
const FOTMOB_SSR_DELAY_COMPENSATION_SECONDS = 180;

function useTicker(active, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return now;
}

// ─────────────────────────────────────────────────────────────
// 다크/라이트 테마 토글 (data-theme 속성 + localStorage 저장)
// ─────────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = "ballix-theme";

function getStoredTheme() {
  if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_STORAGE_KEY) : null;
  return saved === "dark" ? "dark" : "light";
}

function ThemeToggle() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드" : "다크 모드"}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// 좁은 화면(모바일) 여부 — 라인업을 세로 피치로 전환하는 데 사용
function useIsNarrow(maxWidth = 680) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (event) => setNarrow(event.matches);
    setNarrow(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return narrow;
}

function LiveClock({ match }) {
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

export default function App() {
  const [screen, setScreen] = useState("main");
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const isLoggedIn = Boolean(currentUser);
  const isAdmin = currentUser?.role === "ADMIN_USER";

  useEffect(() => {
    let mounted = true;

    userApi
      .me()
      .then((user) => {
        if (mounted) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (mounted) {
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsAuthLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function loadMatches({ silent = false } = {}) {
    if (!silent) {
      setIsMatchesLoading(true);
      setMatchesError("");
    }

    try {
      const response = await matchApi.getAllMatches({ size: MATCH_LIST_FETCH_SIZE });
      const dbMatches = getPageContent(response);
      const normalizedMatches = [...dbMatches]
        .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime())
        .map(normalizeMatch);

      setMatches(normalizedMatches);
      setSelectedMatch((current) => {
        if (!current) {
          return normalizedMatches[0] || null;
        }
        return normalizedMatches.find((item) => item.id === current.id) || current;
      });
    } catch (error) {
      if (!silent) {
        setMatches([]);
        setMatchesError(error.message || "경기 일정을 불러오지 못했습니다.");
      }
    } finally {
      if (!silent) {
        setIsMatchesLoading(false);
      }
    }
  }

  useEffect(() => {
    loadMatches();
  }, []);

  // 진행 중(IN_PLAY) 경기가 있으면 주기적으로 조용히 새로고침해
  // 백엔드가 ~10분마다 갱신한 liveStartedAt 앵커/스코어를 재반영한다.
  const hasLiveMatch = matches.some((match) => match.statusRaw === "IN_PLAY");
  useEffect(() => {
    if (!hasLiveMatch) {
      return undefined;
    }
    const id = setInterval(() => loadMatches({ silent: true }), 60000);
    return () => clearInterval(id);
  }, [hasLiveMatch]);

  function handleGoogleLogin() {
    authApi.loginWithGoogle();
  }

  async function handleLogout() {
    try {
      await authApi.logout();
    } finally {
      setCurrentUser(null);
      setScreen("main");
    }
  }

  async function handleGenerateAi(matchId, { force = false } = {}) {
    const updatedMatch = await adminApi.predictAi(matchId, { force });
    const normalizedMatch = normalizeMatch(updatedMatch);

    setMatches((currentMatches) =>
      currentMatches.map((match) => (match.id === normalizedMatch.id ? normalizedMatch : match)),
    );
    setSelectedMatch((current) =>
      current && current.id === normalizedMatch.id ? normalizedMatch : current,
    );
    return normalizedMatch;
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onBack={() => setScreen("main")}
        onPreview={() => setScreen("main")}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  if (screen === "leaderboard") {
    return <LeaderboardScreen user={currentUser} onBack={() => setScreen("main")} />;
  }

  if (screen === "myPredictions") {
    return <MyPredictionsScreen onBack={() => setScreen("main")} />;
  }

  if (screen === "standings") {
    return <StandingsScreen user={currentUser} onBack={() => setScreen("main")} />;
  }

  if (screen === "worldcup") {
    return (
      <WorldCupScreen
        matches={matches}
        onBack={() => setScreen("main")}
        onSelectMatch={(match) => {
          setSelectedMatch(match);
          setScreen("detail");
        }}
      />
    );
  }

  if (screen === "admin" && isAdmin) {
    return <AdminScreen user={currentUser} onBack={() => setScreen("main")} />;
  }

  if (screen === "detail") {
    return (
      <DetailScreen
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        user={currentUser}
        match={selectedMatch}
        onBack={() => setScreen("main")}
        onGenerateAi={handleGenerateAi}
        onLogin={() => setScreen("login")}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <MainScreen
      isLoggedIn={isLoggedIn}
      isAdmin={isAdmin}
      isAuthLoading={isAuthLoading}
      isMatchesLoading={isMatchesLoading}
      matches={matches}
      matchesError={matchesError}
      user={currentUser}
      onLogin={() => setScreen("login")}
      onLogout={handleLogout}
      onRetryMatches={loadMatches}
      onGenerateAi={handleGenerateAi}
      onOpenLeaderboard={() => setScreen("leaderboard")}
      onOpenMyPredictions={() => (isLoggedIn ? setScreen("myPredictions") : setScreen("login"))}
      onOpenStandings={() => setScreen("standings")}
      onOpenWorldCup={() => setScreen("worldcup")}
      onOpenAdmin={() => (isAdmin ? setScreen("admin") : null)}
      onSelectMatch={(match) => {
        setSelectedMatch(match);
        setScreen("detail");
      }}
    />
  );
}

function LoginScreen({ onBack, onPreview, onGoogleLogin }) {
  return (
    <main className="login-shell">
      <section className="login-screen">
        <div className="login-visual" aria-hidden="true">
          <div className="prediction-preview">
            <div className="preview-top">
              <span>2026 FIFA 월드컵</span>
              <strong>77% YES</strong>
            </div>
            <h2>대한민국 vs 체코</h2>
            <div className="preview-buttons">
              <span>대한민국 승</span>
              <span>무승부</span>
              <span>체코 승</span>
            </div>
          </div>
          <div className="floating-card">
            <ShieldCheck size={22} />
            <span>Google 로그인으로 역할 확인</span>
          </div>
        </div>

        <section className="login-panel">
          <span className="brand-pill">BALLIX</span>
          <h1>축구 예측의 다른 재미를 시작하세요</h1>
          <p>
            AI와 알고리즘이 정리한 승무패 근거를 보고, 내 예측을 남기고,
            랭킹에서 결과를 함께 확인합니다.
          </p>

          <button className="google-login" type="button" onClick={onGoogleLogin}>
            <Chrome size={22} />
            Google로 계속하기
          </button>

          <button className="demo-login" type="button" onClick={onPreview}>
            메인 화면으로 돌아가기
          </button>

          <button className="back-link" type="button" onClick={onBack}>
            로그인 없이 경기 일정 보기
          </button>

          <div className="role-note">
            <strong>권한 안내</strong>
            <span>관리자 계정은 경기마다 AI 승률 예측을 켤 수 있고, 일반 계정은 승부예측에 참여합니다.</span>
          </div>
        </section>

        <section className="benefit-list" aria-label="주요 기능">
          {loginBenefits.map(({ icon: Icon, title, text }) => (
            <article className="benefit-card" key={title}>
              {createElement(Icon, { size: 24 })}
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

function MainScreen({
  isAuthLoading,
  isAdmin,
  isLoggedIn,
  isMatchesLoading,
  matches,
  matchesError,
  onGenerateAi,
  onLogin,
  onLogout,
  onOpenLeaderboard,
  onOpenMyPredictions,
  onOpenStandings,
  onOpenWorldCup,
  onOpenAdmin,
  onRetryMatches,
  onSelectMatch,
  user,
}) {
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => formatDateInputValue(new Date()));
  const [aiFilter, setAiFilter] = useState("all");
  const worldCupGroups = [
    ...new Set(
      matches
        .filter((match) => getCompetitionFilterValue(match) === "worldcup")
        .map((match) => match.group)
        .filter((group) => group && group !== "일정"),
    ),
  ].sort((a, b) => getGroupSortValue(a).localeCompare(getGroupSortValue(b)));
  const filteredMatches = matches.filter((match) => {
    const competitionValue = getCompetitionFilterValue(match);
    const matchesCompetition = competitionFilter === "all" || competitionValue === competitionFilter;
    const matchesGroup =
      competitionFilter !== "worldcup" || groupFilter === "all" || match.group === groupFilter;
    const matchesDate = !dateFilter || formatDateInputValue(match.matchTimeRaw) === dateFilter;
    const matchesAi =
      aiFilter === "all" ||
      (aiFilter === "with" && match.hasAiPrediction) ||
      (aiFilter === "without" && !match.hasAiPrediction);

    return matchesCompetition && matchesGroup && matchesDate && matchesAi;
  });
  const todayMatchesCount = filteredMatches.filter((match) => isToday(match.matchTimeRaw)).length;
  const sortedMatches = [...filteredMatches].sort(compareMatches);
  const liveMatches = sortedMatches.filter((match) => match.statusRaw === "IN_PLAY");
  const restMatches = sortedMatches.filter((match) => match.statusRaw !== "IN_PLAY");

  function handleCompetitionFilter(nextFilter) {
    setCompetitionFilter(nextFilter);
    setGroupFilter("all");
  }

  function navigateDate(delta) {
    setDateFilter((prev) => {
      let y, m, d;
      if (prev) {
        [y, m, d] = prev.split("-").map(Number);
      } else {
        const now = new Date();
        [y, m, d] = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
      }
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + delta);
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
    });
  }

  return (
    <main className="main-shell">
      <section className="main-screen">
        <header className="main-topbar">
          <div className="main-logo">
            <span className="brand-pill">BALLIX</span>
            <strong>AI 승부예측</strong>
          </div>
          <nav aria-label="주요 메뉴">
            <a href="#matches">경기 일정</a>
            <button type="button" className="nav-link wc-nav-btn" onClick={onOpenWorldCup}>
              월드컵
            </button>
            <button type="button" className="nav-link" onClick={onOpenStandings}>
              순위
            </button>
            <button type="button" className="nav-link" onClick={onOpenMyPredictions}>
              내 예측
            </button>
            <button type="button" className="nav-link" onClick={onOpenLeaderboard}>
              랭킹
            </button>
            {isAdmin && (
              <button type="button" className="nav-link admin-nav" onClick={onOpenAdmin}>
                관리자
              </button>
            )}
          </nav>
          {!isLoggedIn ? (
            <div className="account-actions">
              <ThemeToggle />
              <button type="button" onClick={onLogin}>
                {isAuthLoading ? "확인 중" : "로그인"}
              </button>
            </div>
          ) : (
            <div className="account-actions">
              <ThemeToggle />
              <span className="account-chip">{user?.name || "사용자"}</span>
              {isAdmin && <span className="admin-badge">관리자</span>}
              <button type="button" onClick={onLogout}>
                로그아웃
              </button>
            </div>
          )}
        </header>

        {!isLoggedIn && (
          <section className="main-hero">
            <div>
              <span className="brand-pill">2026 FIFA 월드컵</span>
              <h1>로그인 없이도 경기 일정은 바로 확인하세요</h1>
              <p>메인에서는 크롤링된 경기 일정을 먼저 보여주고, 상세 페이지에서 AI 승률과 승부예측을 확인합니다.</p>
              <button type="button" onClick={onLogin}>
                Google 로그인
              </button>
            </div>
          </section>
        )}

        <section className="summary-grid">
          <article>
            <span>오늘 경기</span>
            <strong>{todayMatchesCount}개</strong>
            <p>DB 기준 전체 일정</p>
          </article>
          <article>
            <span>공개 정보</span>
            <strong>{filteredMatches.length}개</strong>
            <p>현재 필터 결과</p>
          </article>
          <article>
            <span>상세 기능</span>
            <strong>AI</strong>
            <p>상세 페이지에서 확인</p>
          </article>
        </section>

        <section className="feed-panel" id="predictions">
          <NoticeBanner />
          <div className="panel-head">
            <div>
              <h2>경기 일정</h2>
              <p>DB에 등록된 전체 경기 일정</p>
            </div>
            <button type="button" onClick={onRetryMatches}>새로고침</button>
          </div>

          {liveMatches.length > 0 && (
            <div className="live-now-block">
              <div className="live-now-head">
                <span className="live-dot" />
                진행 중 ({liveMatches.length})
              </div>
              <div className="prediction-feed">
                {liveMatches.map((item) => (
                  <ScheduleItem
                    item={item}
                    key={item.id}
                    isAdmin={isAdmin}
                    live
                    onSelect={onSelectMatch}
                    onGenerateAi={onGenerateAi}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="match-filters" aria-label="경기 일정 필터">
            <label>
              <span>경기</span>
              <select
                value={competitionFilter}
                onChange={(event) => handleCompetitionFilter(event.target.value)}
              >
                {competitionFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </label>
            {competitionFilter === "worldcup" && (
              <label>
                <span>조</span>
                <select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                >
                  <option value="all">전체 조</option>
                  {worldCupGroups.map((group) => (
                    <option key={group} value={group}>{getGroupLabel(group)}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>날짜</span>
              <span className="date-nav-wrap">
                <button type="button" className="date-nav-btn" onClick={() => navigateDate(-1)}>‹</button>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                />
                <button type="button" className="date-nav-btn" onClick={() => navigateDate(1)}>›</button>
              </span>
            </label>
            <label>
              <span>AI 승률</span>
              <select
                value={aiFilter}
                onChange={(event) => setAiFilter(event.target.value)}
              >
                {aiFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </label>
            <button
              className="filter-reset"
              type="button"
              onClick={() => {
                setCompetitionFilter("all");
                setGroupFilter("all");
                setDateFilter(formatDateInputValue(new Date()));
                setAiFilter("all");
              }}
            >
              초기화
            </button>
          </div>
          {isMatchesLoading && <StateMessage text="경기 일정을 불러오는 중" />}
          {!isMatchesLoading && matchesError && (
            <StateMessage actionLabel="다시 시도" onAction={onRetryMatches} text="경기 일정을 불러오지 못했습니다" />
          )}
          {!isMatchesLoading && !matchesError && matches.length === 0 && (
            <StateMessage text="등록된 경기 일정이 없습니다" />
          )}
          {!isMatchesLoading && !matchesError && matches.length > 0 && filteredMatches.length === 0 && (
            <StateMessage text="필터에 맞는 경기 일정이 없습니다" />
          )}
          {!isMatchesLoading && !matchesError && restMatches.length > 0 && (
            <div className="prediction-feed">
              {restMatches.map((item) => (
                <ScheduleItem
                  item={item}
                  key={item.id}
                  isAdmin={isAdmin}
                  onSelect={onSelectMatch}
                  onGenerateAi={onGenerateAi}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="side-feed">
          <section className="feed-panel" id="matches">
            <div className="panel-head compact">
              <h2>Live</h2>
              <span>BETA</span>
            </div>
            <div className="match-list">
              {liveMatches.length === 0 ? (
                <StateMessage text="진행 중인 경기가 없습니다" />
              ) : (
                liveMatches.map((match) => (
                  <article className="match-card is-live" key={`side-${match.id}`}>
                    <div>
                      <strong>{match.homeTeam}</strong>
                      <span>{match.matchTime}</span>
                    </div>
                    <b>{match.score || "VS"}</b>
                    <div>
                      <strong>{match.awayTeam}</strong>
                      <span><LiveClock match={match} /></span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="feed-panel">
            <div className="panel-head compact">
              <h2>바로가기</h2>
            </div>
            <div className="shortcut-grid">
              <button type="button" className="shortcut-button" onClick={onOpenLeaderboard}>
                <Trophy size={18} />
                <span>랭킹 보기</span>
              </button>
              <button type="button" className="shortcut-button" onClick={onOpenMyPredictions}>
                <BarChart3 size={18} />
                <span>내 예측</span>
              </button>
            </div>
            <div className="ai-note">
              <strong>AI 승률은 메인에 노출하지 않습니다</strong>
              <p>경기 상세로 들어가면 승률, 근거, 로그인 기반 승무패 예측 참여 영역을 확인할 수 있습니다.</p>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ScheduleItem({ isAdmin, item, live = false, onGenerateAi, onSelect }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate(event) {
    event.stopPropagation();
    setIsGenerating(true);
    setError("");
    try {
      await onGenerateAi(item.id, { force: false });
    } catch (generateError) {
      setError(generateError.message || "생성 실패");
    } finally {
      setIsGenerating(false);
    }
  }

  const canGenerate =
    isAdmin && !item.hasAiPrediction && !["FINISHED", "CANCELLED"].includes(item.statusRaw);

  return (
    <article
      className={`prediction-item schedule-item ${live ? "is-live" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="item-meta">
        <span>{item.category}</span>
        <b>{item.group}</b>
        {item.hasAiPrediction && <span className="ai-flag">AI 승률</span>}
        {item.statusRaw === "IN_PLAY" && <LiveClock match={item} />}
      </div>
      <div className="item-body">
        <div className="match-team home">
          <TeamCrest crest={item.homeCrest} name={item.homeTeam} />
          <strong>{item.homeTeam}</strong>
        </div>
        <div className="match-centerline">
          <h3>VS</h3>
          {item.score && <strong className="match-scoreline">{item.score}</strong>}
          <p className="match-subtext">{item.matchTime} · {item.venue}</p>
        </div>
        <div className="match-team away">
          <strong>{item.awayTeam}</strong>
          <TeamCrest crest={item.awayCrest} name={item.awayTeam} />
        </div>
        <div className="status-pill">
          <strong>{item.status}</strong>
          <span>상세 보기</span>
        </div>
      </div>
      <footer>
        {canGenerate ? (
          <button
            type="button"
            className="inline-ai-button"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "AI 승률 생성 중" : "AI 승률 생성"}
          </button>
        ) : (
          <span>대회 {item.category}</span>
        )}
        {error ? <strong className="action-error">{error}</strong> : <strong>상세 보기</strong>}
      </footer>
    </article>
  );
}

function TeamCrest({ crest, name, size = "small" }) {
  const sizeClass = size === "large" ? "large" : size === "flag" ? "flag-crest" : "mini-crest";

  return (
    <div className={`team-crest ${sizeClass}`}>
      {crest ? <img alt={`${name} 엠블럼`} src={crest} /> : <span>{name.slice(0, 1)}</span>}
    </div>
  );
}

function StateMessage({ actionLabel, onAction, text }) {
  return (
    <div className="state-message">
      <strong>{text}</strong>
      {actionLabel && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 리더보드 화면
// ─────────────────────────────────────────────────────────────
function LeaderboardScreen({ onBack, user }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");

    userApi
      .leaderboard()
      .then((data) => {
        if (mounted) {
          setRows(getPageContent(data));
        }
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError.message || "랭킹을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>랭킹</strong>
          <span className="account-chip subtle">{user?.name || "게스트"}</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">LEADERBOARD</span>
          <h1>적중 랭킹</h1>
          <p>{LEADERBOARD_MIN_MATCHES}경기 이상 참여하면 공식 순위에 집계됩니다.</p>
        </section>

        <section className="detail-panel board-panel">
          {isLoading && <StateMessage text="랭킹을 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && rows.length === 0 && (
            <StateMessage text="아직 집계된 랭킹이 없습니다" />
          )}
          {!isLoading && !error && rows.length > 0 && (
            <ol className="rank-table">
              <li className="rank-row rank-head">
                <span className="rank-no">순위</span>
                <span className="rank-name">이름</span>
                <span className="rank-stat">경기</span>
                <span className="rank-stat">적중</span>
                <span className="rank-stat">적중률</span>
              </li>
              {rows.map((row) => {
                const eligible = row.matchesPlayed >= LEADERBOARD_MIN_MATCHES;
                const isMe = user && row.name === user.name;
                return (
                  <li
                    className={`rank-row ${eligible ? "" : "is-pending"} ${isMe ? "is-me" : ""}`}
                    key={`${row.rank}-${row.name}`}
                  >
                    <span className="rank-no">{eligible ? row.rank : "—"}</span>
                    <span className="rank-name">
                      {row.name}
                      {isMe && <em className="me-tag">나</em>}
                    </span>
                    <span className="rank-stat">{row.matchesPlayed}</span>
                    <span className="rank-stat">{row.correctCount}</span>
                    <span className="rank-stat">{row.winRate ?? row.accuracy ?? "—"}%</span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="board-foot">
            회색 처리된 사용자는 {LEADERBOARD_MIN_MATCHES}경기 미만으로 아직 공식 순위에 들지 않습니다.
          </p>
        </section>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 내 예측 화면
// ─────────────────────────────────────────────────────────────
function MyPredictionsScreen({ onBack }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");

    predictionApi
      .getMyPredictions()
      .then((data) => {
        if (mounted) {
          setRows(getPageContent(data));
        }
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError.message || "내 예측을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const gradedCount = rows.filter((row) => row.isCorrect !== null).length;
  const correctCount = rows.filter((row) => row.isCorrect === true).length;

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>내 예측</strong>
          <span className="account-chip subtle">
            {gradedCount > 0 ? `${correctCount}/${gradedCount} 적중` : "채점 대기"}
          </span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">MY PICKS</span>
          <h1>내가 남긴 예측</h1>
          <p>경기가 종료되면 자동으로 채점되어 적중 여부가 표시됩니다.</p>
        </section>

        <section className="detail-panel board-panel">
          {isLoading && <StateMessage text="내 예측을 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && rows.length === 0 && (
            <StateMessage text="아직 남긴 예측이 없습니다" />
          )}
          {!isLoading && !error && rows.length > 0 && (
            <div className="my-pred-list">
              {rows.map((row) => {
                const homeName = getTeamNameByOriginal(row.homeTeamName);
                const awayName = getTeamNameByOriginal(row.awayTeamName);
                const resultClass =
                  row.isCorrect === true ? "correct" : row.isCorrect === false ? "wrong" : "pending";
                const resultLabel =
                  row.isCorrect === true ? "적중" : row.isCorrect === false ? "실패" : "대기";
                return (
                  <article className={`my-pred-row ${resultClass}`} key={row.id}>
                    <div className="my-pred-teams">
                      <strong>{homeName}</strong>
                      <span>vs</span>
                      <strong>{awayName}</strong>
                    </div>
                    <div className="my-pred-pick">
                      내 예측 · <b>{winnerLabels[row.predictedWinner] || row.predictedWinner}</b>
                    </div>
                    <span className={`my-pred-result ${resultClass}`}>{resultLabel}</span>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 경기 상세 화면
// ─────────────────────────────────────────────────────────────
function DetailScreen({ isAdmin, isLoggedIn, match, onBack, onGenerateAi, onLogin, onLogout, user }) {
  const [collapsedPanels, setCollapsedPanels] = useState({});
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiActionError, setAiActionError] = useState("");

  // FotMob 통합 뷰 (라인업/이벤트/포메이션)
  const [fotmob, setFotmob] = useState(null);
  const [fotmobLoading, setFotmobLoading] = useState(true);
  const [fotmobError, setFotmobError] = useState("");

  // AI 골 요약 (종료 경기)
  const [aiSummary, setAiSummary] = useState(match?.raw?.aiSummary || "");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const matchId = match?.id;
  const matchStatus = match?.statusRaw;

  // 최초 로드 (matchId 기준이라 라이브 폴링으로 match 객체가 바뀌어도 깜빡이지 않음)
  useEffect(() => {
    if (!matchId) {
      return undefined;
    }
    let mounted = true;
    setFotmobLoading(true);
    setFotmobError("");
    setFotmob(null);

    matchApi
      .getFotmobView(matchId)
      .then((data) => {
        if (mounted) {
          setFotmob(data);
        }
      })
      .catch((error) => {
        if (mounted) {
          setFotmobError(error.message || "라인업 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (mounted) {
          setFotmobLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [matchId]);

  // 진행 중이면 라인업/이벤트/스코어를 조용히 주기 갱신 (로딩 표시 없음)
  useEffect(() => {
    if (!matchId || matchStatus !== "IN_PLAY") {
      return undefined;
    }
    let mounted = true;
    const id = setInterval(() => {
      matchApi
        .getFotmobView(matchId)
        .then((data) => {
          if (mounted) {
            setFotmob(data);
          }
        })
        .catch(() => {});
    }, 600000); // 10분마다 갱신 (초당 client-side tick으로 보완)
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [matchId, matchStatus]);

  if (!match) {
    return (
      <main className="detail-shell">
        <section className="detail-screen">
          <StateMessage actionLabel="메인으로" onAction={onBack} text="경기 정보를 찾을 수 없습니다" />
        </section>
      </main>
    );
  }

  const isFinished = match.statusRaw === "FINISHED";

  function togglePanel(panelId) {
    setCollapsedPanels((current) => ({
      ...current,
      [panelId]: !current[panelId],
    }));
  }

  async function handleAiAction(force = false) {
    setIsGeneratingAi(true);
    setAiActionError("");

    try {
      await onGenerateAi(match.id, { force });
    } catch (error) {
      setAiActionError(error.message || "AI 승률 예측을 생성하지 못했습니다.");
    } finally {
      setIsGeneratingAi(false);
    }
  }

  function handleLoadSummary() {
    setSummaryLoading(true);
    setSummaryError("");
    matchApi
      .getAiSummary(match.id)
      .then((data) => setAiSummary(data?.summary ?? data))
      .catch((error) => setSummaryError(error.message || "요약을 불러오지 못했습니다."))
      .finally(() => setSummaryLoading(false));
  }

  const lineup = fotmob?.lineup || [];
  // 동일 (type, minute, addedTime, fotmobPlayerId) 중복 이벤트 제거 (DB 이중 저장 방어)
  const events = (() => {
    const raw = fotmob?.events || [];
    const seen = new Set();
    return raw.filter((e) => {
      const key = `${e.type}|${e.minute ?? ""}|${e.addedTime ?? ""}|${e.fotmobPlayerId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const homeFormation = fotmob?.homeFormation || match.raw?.homeFormation || "";
  const awayFormation = fotmob?.awayFormation || match.raw?.awayFormation || "";

  return (
    <main className="detail-shell">
      <section className="detail-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 일정으로</button>
          <strong>경기 상세</strong>
          {!isLoggedIn ? (
            <div className="account-actions">
              <ThemeToggle />
              <button type="button" onClick={onLogin}>로그인</button>
            </div>
          ) : (
            <div className="account-actions">
              <ThemeToggle />
              <span className="account-chip">{user?.name || "사용자"}</span>
              {isAdmin && <span className="admin-badge">관리자</span>}
              <button type="button" onClick={onLogout}>로그아웃</button>
            </div>
          )}
        </header>

        <section className="detail-hero">
          <span className="brand-pill">{match.category}</span>
          <div className="matchup-board">
            <div>
              <TeamCrest crest={match.homeCrest} name={match.homeTeam} size="large" />
              <strong>{match.homeTeam}</strong>
            </div>
            <div className="match-center">
              <b>{match.score || "VS"}</b>
              {match.statusRaw === "IN_PLAY" && (
                <span className="detail-live-clock"><LiveClock match={match} /></span>
              )}
              <span>{match.matchTime}</span>
              <small>{match.venue}</small>
            </div>
            <div>
              <TeamCrest crest={match.awayCrest} name={match.awayTeam} size="large" />
              <strong>{match.awayTeam}</strong>
            </div>
          </div>
          <p>{match.group} · {match.status} · 크롤링 경기 상세</p>
        </section>

        <CollapsiblePanel
          badge="실시간 경기 정보"
          className="lineup-section detail-panel"
          collapsed={collapsedPanels.lineup}
          id="lineup"
          onToggle={togglePanel}
          title="선발 라인업"
        >
          <LineupSection
            match={match}
            lineup={lineup}
            events={events}
            homeFormation={homeFormation}
            awayFormation={awayFormation}
            loading={fotmobLoading}
            error={fotmobError}
          />
          <div className="event-legend">
            <span><span className="mark goal">⚽</span> 골</span>
            <span><span className="mark assist">🅰️</span> 어시스트</span>
            <span><span className="mark card yellow legend-card" /> 옐로카드</span>
            <span><span className="mark card red legend-card" /> 레드카드</span>
            <span><span className="sub-badge out legend-sub">↓N'</span> 교체 아웃</span>
            <span><em className="bench-in">↑N'</em> 교체 인</span>
            <span>
              <b className="rating-chip rating-high">8+</b>
              <b className="rating-chip rating-mid" style={{marginLeft:3}}>6~8</b>
              <b className="rating-chip rating-low" style={{marginLeft:3}}>~6</b>
              {" 평점"}
            </span>
          </div>
        </CollapsiblePanel>

        <section className="match-info-grid">
          <CollapsiblePanel
            badge="BENCH"
            className="detail-panel"
            collapsed={collapsedPanels.bench}
            id="bench"
            onToggle={togglePanel}
            title="교체 명단"
          >
            <BenchSection match={match} lineup={lineup} events={events} loading={fotmobLoading} />
          </CollapsiblePanel>
        </section>

        <section className="detail-stack">
          <CollapsiblePanel
            badge={`${events.length}개 이벤트`}
            className="detail-panel"
            collapsed={collapsedPanels.events}
            id="events"
            onToggle={togglePanel}
            title="주요 이벤트"
          >
            <EventTimeline match={match} events={events} loading={fotmobLoading} />
          </CollapsiblePanel>

          {match.hasAiPrediction && (
            <CollapsiblePanel
              badge={match.aiPick}
              className="detail-panel ai-panel"
              collapsed={collapsedPanels.ai}
              id="ai"
              onToggle={togglePanel}
              title="AI 승률"
            >
              <AiProbabilityCard
                isAdmin={isAdmin}
                isLoading={isGeneratingAi}
                match={match}
                onRegenerate={() => handleAiAction(true)}
              />
              {aiActionError && <p className="action-error">{aiActionError}</p>}
            </CollapsiblePanel>
          )}

          {isAdmin && !match.hasAiPrediction && (
            <CollapsiblePanel
              badge="관리자 전용"
              className="detail-panel admin-ai-panel"
              collapsed={collapsedPanels.adminAi}
              id="adminAi"
              onToggle={togglePanel}
              title="AI 승률 생성"
            >
              <div className="admin-ai-box">
                <strong>{match.homeTeam} vs {match.awayTeam}</strong>
                <p>이 경기는 아직 관리자가 AI 승률 예측 대상으로 선택하지 않았습니다.</p>
                <button
                  type="button"
                  onClick={() => handleAiAction(false)}
                  disabled={isGeneratingAi || isFinished}
                >
                  {isGeneratingAi ? "생성 중" : isFinished ? "종료된 경기" : "AI 승률 생성"}
                </button>
                {aiActionError && <p className="action-error">{aiActionError}</p>}
              </div>
            </CollapsiblePanel>
          )}

          {isFinished && (
            <CollapsiblePanel
              badge="AI 요약"
              className="detail-panel"
              collapsed={collapsedPanels.summary}
              id="summary"
              onToggle={togglePanel}
              title="골 요약"
            >
              <div className="summary-box">
                {aiSummary ? (
                  <p className="ai-detail">{aiSummary}</p>
                ) : (
                  <div className="summary-empty">
                    <p>경기 골 내용을 AI가 한국어 해설로 요약합니다.</p>
                    <button type="button" onClick={handleLoadSummary} disabled={summaryLoading}>
                      {summaryLoading ? "요약 불러오는 중" : "골 요약 보기"}
                    </button>
                  </div>
                )}
                {summaryError && <p className="action-error">{summaryError}</p>}
              </div>
            </CollapsiblePanel>
          )}

          <CollapsiblePanel
            className="detail-panel vote-panel"
            collapsed={collapsedPanels.vote}
            id="vote"
            onToggle={togglePanel}
            title="승부예측"
          >
            <PredictionPanel
              match={match}
              isLoggedIn={isLoggedIn}
              onLogin={onLogin}
            />
          </CollapsiblePanel>
        </section>
      </section>
    </main>
  );
}

function CollapsiblePanel({ badge, children, className, collapsed, id, onToggle, title }) {
  return (
    <article className={`${className} collapsible-panel ${collapsed ? "is-collapsed" : ""}`}>
      <div className="panel-head compact collapsible-head">
        <div>
          <h2>{title}</h2>
          {badge && <span>{badge}</span>}
        </div>
        <button type="button" onClick={() => onToggle(id)}>
          {collapsed ? "펼치기" : "접기"}
        </button>
      </div>
      {!collapsed && <div className="collapsible-content">{children}</div>}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// 라인업 (실제 posX/posY 좌표 기반 피치 배치)
// ─────────────────────────────────────────────────────────────
// 선수별 골/어시스트/카드 집계.
// GOAL: fotmobPlayerId 일치=득점, detail(어시스트 제공자명)==이 선수 이름=어시스트
// CARD: detail "Yellow"/"Red"/"YellowRed"
function samePlayerId(a, b) {
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

// FotMob 이벤트 이름은 "Zwane" / "T. Zwane" / "Themba Zwane" 등 축약 가능
// 1) 정확 일치  2) 같은팀 내 성(last word) 일치  3) 이벤트명이 선수명에 포함
function playerNameMatchesEvent(eventName, playerName, eventIsHome, playerIsHome) {
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

function collectPlayerMarks(events, player) {
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

function collectCardsByName(events, name) {
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
function findSubInName(events, player) {
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
const DEPTH_BY_LINE = {
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
function getDetailedLabel(depth, lateral) {
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
function getPlayerLayout(player) {
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
function isValidFormation(f) {
  if (!f || typeof f !== "string") return false;
  const parts = f.split("-");
  if (parts.length < 2 || parts.length > 5) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n <= 0 || n >= 10)) return false;
  const total = nums.reduce((a, b) => a + b, 0);
  return total >= 9 && total <= 11;
}

// 선발 선수들의 posX(우선) 또는 positionId로 포메이션 문자열을 역산 (DEF/MID/ATT 3분할)

function getRatingClass(rating) {
  if (!Number.isFinite(rating)) return "";
  if (rating >= 8) return "rating-high";
  if (rating >= 6) return "rating-mid";
  return "rating-low";
}

function PlayerMarks({ marks }) {
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
}

function LineupSection({ awayFormation, error, events, homeFormation, lineup, loading, match }) {
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
            />
          ))}
          {awayStarters.map((player) => (
            <PitchPlayer
              key={`a-${player.id}`}
              player={player}
              events={events}
              side="away"
              vertical={isNarrow}
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
          />
          <FormationColumn
            title={match.awayTeam}
            formation={awayFormationLabel}
            players={awayStarters}
            events={events}
          />
        </div>
      )}
    </div>
  );
}

function PitchPlayer({ events, player, side, vertical = false }) {
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

function FormationColumn({ events, formation, players, title }) {
  return (
    <div className="formation-column">
      <div className="formation-column-head">
        <strong>{title}</strong>
        {formation && <span>{formation}</span>}
      </div>
      <div className="formation-column-list">
        {players.map((player) => {
          const marks = collectPlayerMarks(events, player);
          const subOut = Number.isFinite(player.subOutMinute) ? player.subOutMinute : null;
          const layout = getPlayerLayout(player);
          return (
            <div className="formation-row" key={player.id}>
              <PlayerPhoto id={player.fotmobPlayerId} name={player.name} small />
              <span className="formation-row-name">
                {Number.isFinite(player.shirtNumber) && <b>{player.shirtNumber}</b>}
                {player.name}
                {layout?.label && <em className="pos-inline">{layout.label}</em>}
              </span>
              {subOut !== null && <span className="sub-inline out">↓{subOut}'</span>}
              <span className="formation-row-badges">
                <PlayerMarks marks={marks} />
              </span>
              {Number.isFinite(player.rating) && (
                <span className={`rating-chip ${getRatingClass(player.rating)}`}>{player.rating}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function PlayerPhoto({ id, name, small = false }) {
  const [failed, setFailed] = useState(false);
  const src = id
    ? `https://images.fotmob.com/image_resources/playerimages/${id}.png`
    : "";
  const className = `player-photo ${small ? "small" : ""}`;

  if (!src || failed) {
    return <div className={className}>{(name || "?").slice(0, 1)}</div>;
  }

  return (
    <div className={`${className} has-img`}>
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}

function BenchSection({ events, lineup, loading, match }) {
  if (loading) {
    return <StateMessage text="명단을 불러오는 중" />;
  }

  const homeBench = lineup.filter((player) => player.home && !player.starter);
  const awayBench = lineup.filter((player) => !player.home && !player.starter);

  if (homeBench.length === 0 && awayBench.length === 0) {
    return <StateMessage text="교체 명단이 아직 없습니다" />;
  }

  // 교체 투입된 선수(subInMinute 있음)를 위로 정렬
  const sortBench = (list) =>
    [...list].sort((a, b) => {
      const aIn = Number.isFinite(a.subInMinute) ? 0 : 1;
      const bIn = Number.isFinite(b.subInMinute) ? 0 : 1;
      if (aIn !== bIn) {
        return aIn - bIn;
      }
      return (a.subInMinute ?? 0) - (b.subInMinute ?? 0);
    });

  return (
    <div className="bench-grid">
      <BenchList team={match.homeTeam} players={sortBench(homeBench)} events={events} />
      <BenchList team={match.awayTeam} players={sortBench(awayBench)} events={events} />
    </div>
  );
}

function BenchList({ events, players, team }) {
  return (
    <div className="bench-list">
      <strong>{team}</strong>
      {players.length === 0 ? (
        <span className="bench-empty">명단 없음</span>
      ) : (
        players.map((player) => {
          const marks = collectPlayerMarks(events, player);
          const subIn = Number.isFinite(player.subInMinute) ? player.subInMinute : null;
          const outName = subIn !== null ? findSubInName(events, player) : null;
          const outMarks = outName ? collectCardsByName(events, outName) : null;
          return (
            <span className={`bench-row ${subIn !== null ? "came-in" : ""}`} key={player.id}>
              <PlayerPhoto id={player.fotmobPlayerId} name={player.name} small />
              <span className="bench-name">
                {Number.isFinite(player.shirtNumber) && <b>{player.shirtNumber}</b>}
                {player.name}
                {subIn !== null && (
                  <span className="sub-info-in">
                    <em className="bench-in">↑{subIn}'</em>
                    {outName && (
                      <span className="bench-out-row">
                        <em className="bench-out-name">↓{outName}</em>
                        {outMarks?.yellow > 0 && <span className="mark card yellow legend-card" title="옐로카드" />}
                        {outMarks?.red > 0 && <span className="mark card red legend-card" title="레드카드" />}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <PlayerMarks marks={marks} />
              {Number.isFinite(player.rating) && (
                <span className={`rating-chip ${getRatingClass(player.rating)}`}>{player.rating}</span>
              )}
            </span>
          );
        })
      )}
    </div>
  );
}

function EventTimeline({ events, loading, match }) {
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

function eventIcon(event) {
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

function eventDetailText(event) {
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
function PredictionPanel({ isLoggedIn, match, onLogin }) {
  const [myPrediction, setMyPrediction] = useState(null);
  const [ratio, setRatio] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const kickoffPassed = new Date(match.matchTimeRaw).getTime() <= Date.now();
  const isOpen = match.statusRaw === "SCHEDULED" && !kickoffPassed;

  useEffect(() => {
    if (!isLoggedIn) {
      setMyPrediction(null);
      setRatio(null);
      setLoadError("");
      return undefined;
    }
    let mounted = true;
    setIsLoading(true);
    setLoadError("");

    predictionApi
      .findByMatch(match.id)
      .then((prediction) => {
        if (!mounted) {
          return;
        }
        setMyPrediction(prediction);
        return predictionApi.getRatio(match.id).then((data) => {
          if (mounted) {
            setRatio(data);
          }
        });
      })
      .catch((loadErr) => {
        if (!mounted) {
          return;
        }
        // 서버/세션 오류는 "예측 안 함"과 구분해서 사용자에게 알린다.
        // (예측 전이면 백엔드가 400/404로 응답 → 정상 흐름이라 메시지 없음)
        const status = loadErr instanceof ApiError ? loadErr.status : undefined;
        setMyPrediction(null);
        setRatio(null);
        if (status === 401) {
          setLoadError("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        } else if (status === 0 || status >= 500) {
          setLoadError("예측 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } else {
          setLoadError("");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isLoggedIn, match.id]);

  async function handleVote(winner) {
    setIsSubmitting(true);
    setError("");
    try {
      const prediction = await predictionApi.predict(match.id, winner);
      setMyPrediction(prediction);
      const data = await predictionApi.getRatio(match.id);
      setRatio(data);
    } catch (voteError) {
      setError(voteError.message || "예측을 저장하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const voteOptions = [
    { label: `${match.homeTeam} 승`, value: "HOME_TEAM" },
    { label: "무승부", value: "DRAW" },
    { label: `${match.awayTeam} 승`, value: "AWAY_TEAM" },
  ];

  if (!isLoggedIn) {
    return (
      <div className="vote-lock-wrap">
        <div className="vote-choice-grid" aria-hidden="true">
          {voteOptions.map((option) => (
            <button type="button" key={option.value} disabled>
              {option.label}
            </button>
          ))}
        </div>
        <div className="login-overlay">
          <strong>로그인을 해주세요</strong>
          <p>로그인하면 승부예측에 참여하고 랭킹 점수를 받을 수 있습니다.</p>
          <button type="button" onClick={onLogin}>Google 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-active">
      {isLoading && <StateMessage text="내 예측을 확인하는 중" />}

      {!isLoading && (
        <>
          {loadError && <p className="action-error">{loadError}</p>}
          <div className="vote-choice-grid">
            {voteOptions.map((option) => {
              const isPicked = myPrediction?.predictedWinner === option.value;
              return (
                <button
                  type="button"
                  key={option.value}
                  className={isPicked ? "is-picked" : ""}
                  onClick={() => handleVote(option.value)}
                  disabled={isSubmitting || !isOpen}
                >
                  {option.label}
                  {isPicked && <em className="pick-tag">선택함</em>}
                </button>
              );
            })}
          </div>

          {!isOpen && (
            <p className="vote-hint">
              {kickoffPassed || match.statusRaw !== "SCHEDULED"
                ? "이미 시작됐거나 종료된 경기는 예측을 변경할 수 없습니다."
                : "예측을 받을 수 없는 경기입니다."}
            </p>
          )}

          {myPrediction && (
            <p className="vote-current">
              내 예측: <b>{winnerLabels[myPrediction.predictedWinner]}</b>
              {myPrediction.isCorrect === true && <span className="result-chip correct"> 적중</span>}
              {myPrediction.isCorrect === false && <span className="result-chip wrong"> 실패</span>}
            </p>
          )}

          {error && <p className="action-error">{error}</p>}

          {ratio && ratio.total > 0 && (
            <div className="ratio-block">
              <div className="ratio-head">
                <span>참여자 예측 분포</span>
                <b>{ratio.total}명</b>
              </div>
              <div className="probability-stack" aria-label="예측 분포">
                <span className="home" style={{ width: `${ratio.homePercent}%` }}>
                  {ratio.homePercent}%
                </span>
                <span className="draw" style={{ width: `${ratio.drawPercent}%` }}>
                  {ratio.drawPercent}%
                </span>
                <span className="away" style={{ width: `${ratio.awayPercent}%` }}>
                  {ratio.awayPercent}%
                </span>
              </div>
              <div className="probability-legend">
                <span><i className="home" />{match.homeTeam} {ratio.homePercent}%</span>
                <span><i className="draw" />무 {ratio.drawPercent}%</span>
                <span><i className="away" />{match.awayTeam} {ratio.awayPercent}%</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AiProbabilityCard({ isAdmin, isLoading, match, onRegenerate }) {
  const homeValue = match.prediction.home;
  const drawValue = match.prediction.draw;
  const awayValue = match.prediction.away;

  return (
    <section className="probability-table">
      <div className="probability-meta">
        <span>#{match.id} · {match.category}</span>
        <span>{match.matchTimeRaw?.replace("T", " ").slice(0, 16) || match.matchTime} · {match.status}</span>
      </div>

      <div className="probability-matchup">
        <div className="probability-team home">
          <strong>{match.homeTeam}</strong>
          <TeamCrest crest={match.homeCrest} name={match.homeTeam} size="flag" />
        </div>
        <b>vs</b>
        <div className="probability-team away">
          <TeamCrest crest={match.awayCrest} name={match.awayTeam} size="flag" />
          <strong>{match.awayTeam}</strong>
        </div>
      </div>

      <div className="probability-stack" aria-label="AI 승률">
        <span className="home" style={{ width: `${homeValue}%` }}>{homeValue}%</span>
        <span className="draw" style={{ width: `${drawValue}%` }}>{drawValue}%</span>
        <span className="away" style={{ width: `${awayValue}%` }}>{awayValue}%</span>
      </div>

      <div className="probability-legend">
        <span><i className="home" />{match.homeTeam} {homeValue}%</span>
        <span><i className="draw" />무 {drawValue}%</span>
        <span><i className="away" />{match.awayTeam} {awayValue}%</span>
      </div>

      {isAdmin && (
        <button
          className="repredict-button"
          type="button"
          onClick={onRegenerate}
          disabled={isLoading}
        >
          {isLoading ? "재예측 중" : "재예측"}
        </button>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 공지 배너 (메인 피드 상단)
// ─────────────────────────────────────────────────────────────
function NoticeBanner() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    noticeApi
      .list({ size: 3 })
      .then((data) => setNotices(getPageContent(data)))
      .catch(() => {});
  }, []);

  if (notices.length === 0) return null;

  return (
    <div className="notice-banner">
      {notices.map((n) => (
        <div key={n.id} className="notice-banner-item">
          <span className="notice-badge">📢</span>
          <span className="notice-banner-title">{n.title}</span>
          <span className="notice-banner-content">{n.content}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 리그 순위 화면
// ─────────────────────────────────────────────────────────────
function StandingsScreen({ onBack, user }) {
  const [standings, setStandings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    standingsApi
      .getStandings(6)
      .then((data) => setStandings(getPageContent(data)))
      .catch((err) => setError(err.message || "순위를 불러오지 못했습니다."))
      .finally(() => setIsLoading(false));
  }, []);

  const groups = {};
  for (const row of standings) {
    if (!groups[row.groupName]) groups[row.groupName] = [];
    groups[row.groupName].push(row);
  }
  const groupNames = Object.keys(groups).sort();

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>순위표</strong>
          <span className="account-chip subtle">{user?.name || "게스트"}</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">STANDINGS</span>
          <h1>월드컵 조별 순위</h1>
          <p>조별 리그 경기 결과에 따라 실시간 갱신됩니다.</p>
        </section>

        <section className="detail-panel board-panel standings-panel">
          {isLoading && <StateMessage text="순위를 불러오는 중" />}
          {!isLoading && error && <StateMessage text={error} />}
          {!isLoading && !error && groupNames.length === 0 && (
            <StateMessage text="아직 순위 데이터가 없습니다" />
          )}
          {!isLoading && !error && groupNames.map((groupName) => (
            <div key={groupName} className="standings-group">
              <h3 className="standings-group-name">{getGroupLabel(groupName)}</h3>
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>팀</th>
                    <th>경기</th>
                    <th>승</th>
                    <th>무</th>
                    <th>패</th>
                    <th>득실</th>
                    <th>승점</th>
                  </tr>
                </thead>
                <tbody>
                  {[...groups[groupName]]
                    .sort((a, b) => a.rankNo - b.rankNo)
                    .map((row) => (
                      <tr key={row.id}>
                        <td className="rank-col">{row.rankNo}</td>
                        <td className="team-col">
                          {row.crest && (
                            <img src={row.crest} alt="" className="standings-crest" />
                          )}
                          <span>{getTeamNameByOriginal(row.teamName)}</span>
                        </td>
                        <td>{row.played}</td>
                        <td>{row.wins}</td>
                        <td>{row.draws}</td>
                        <td>{row.losses}</td>
                        <td>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                        <td><b>{row.points}</b></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 관리자 패널 화면
// ─────────────────────────────────────────────────────────────
function AdminScreen({ onBack, user }) {
  const [tab, setTab] = useState("notice");

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>관리자 패널</strong>
          <span className="admin-badge">관리자</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">ADMIN</span>
          <h1>관리자 패널</h1>
          <p>공지사항 · 유저 관리 · 데이터 동기화</p>
        </section>

        <div className="admin-tabs">
          <button
            type="button"
            className={tab === "notice" ? "active" : ""}
            onClick={() => setTab("notice")}
          >
            📢 공지사항
          </button>
          <button
            type="button"
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            👥 유저 관리
          </button>
          <button
            type="button"
            className={tab === "data" ? "active" : ""}
            onClick={() => setTab("data")}
          >
            🔄 데이터 관리
          </button>
        </div>

        {tab === "notice" && <AdminNoticeTab />}
        {tab === "users" && <AdminUsersTab user={user} />}
        {tab === "data" && <AdminDataTab />}
      </section>
    </main>
  );
}

function AdminNoticeTab() {
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function loadNotices() {
    setIsLoading(true);
    noticeApi
      .list({ size: 100 })
      .then((data) => setNotices(getPageContent(data)))
      .catch((err) => setError(err.message || "공지를 불러오지 못했습니다."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { loadNotices(); }, []);

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      if (editing === "new") {
        await adminApi.createNotice(form.title.trim(), form.content.trim());
      } else {
        await adminApi.updateNotice(editing.id, form.title.trim(), form.content.trim());
      }
      setEditing(null);
      setForm({ title: "", content: "" });
      loadNotices();
    } catch (err) {
      setError(err.message || "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setError("");
    try {
      await adminApi.deleteNotice(id);
      loadNotices();
    } catch (err) {
      setError(err.message || "삭제에 실패했습니다.");
    }
  }

  function startEdit(notice) {
    setEditing(notice);
    setForm({ title: notice.title, content: notice.content });
  }

  function startNew() {
    setEditing("new");
    setForm({ title: "", content: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ title: "", content: "" });
    setError("");
  }

  return (
    <div className="admin-section">
      {editing ? (
        <div className="notice-form">
          <h3>{editing === "new" ? "공지 작성" : "공지 수정"}</h3>
          <input
            className="notice-form-input"
            placeholder="제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            className="notice-form-textarea"
            placeholder="내용"
            rows={4}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          {error && <p className="action-error">{error}</p>}
          <div className="notice-form-actions">
            <button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "저장 중" : "저장"}
            </button>
            <button type="button" className="secondary-btn" onClick={cancelEdit}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="new-notice-btn" onClick={startNew}>
          + 공지 작성
        </button>
      )}

      {isLoading && <StateMessage text="공지를 불러오는 중" />}
      {!isLoading && !editing && error && <p className="action-error">{error}</p>}
      {!isLoading && notices.length === 0 && !editing && (
        <StateMessage text="등록된 공지가 없습니다" />
      )}
      {!isLoading && notices.map((n) => (
        <div key={n.id} className="notice-admin-row">
          <div className="notice-admin-header">
            <strong>{n.title}</strong>
            <span className="notice-admin-date">{formatMatchDateTime(n.createAt)}</span>
          </div>
          <p className="notice-admin-content">{n.content}</p>
          <div className="notice-row-actions">
            <button type="button" className="small-btn" onClick={() => startEdit(n)}>
              수정
            </button>
            <button
              type="button"
              className="small-btn danger-btn"
              onClick={() => handleDelete(n.id)}
            >
              삭제
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminUsersTab({ user }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");
    adminApi
      .listUsers({ page, size: 8 })
      .then((data) => {
        if (!mounted) return;
        if (data?.content) {
          setUsers(data.content);
          setTotalPages(data.totalPages ?? 1);
        } else {
          setUsers(getPageContent(data));
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message || "유저 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, [page, refreshKey]);

  async function handleRoleChange(u) {
    setError("");
    try {
      await adminApi.changeUserRole(u.id, u.role === "ADMIN_USER" ? "COMMON_USER" : "ADMIN_USER");
      refresh();
    } catch (err) {
      setError(err.message || "권한 변경에 실패했습니다.");
    }
  }

  async function handleStatusChange(u) {
    setError("");
    try {
      await adminApi.changeUserStatus(u.id, !u.active);
      refresh();
    } catch (err) {
      setError(err.message || "계정 상태 변경에 실패했습니다.");
    }
  }

  return (
    <div className="admin-section">
      {error && <p className="action-error">{error}</p>}
      {isLoading && <StateMessage text="유저 목록을 불러오는 중" />}
      {!isLoading && users.length === 0 && !error && (
        <StateMessage text="유저가 없습니다" />
      )}
      {!isLoading && users.map((u) => {
        const isMe = user?.id === u.id;
        return (
          <div
            key={u.id}
            className={`user-admin-row ${!u.active ? "is-banned" : ""} ${isMe ? "is-me" : ""}`}
          >
            <div className="user-admin-info">
              <strong>{u.name}</strong>
              {isMe && <em className="me-tag">나</em>}
              <span className="user-admin-email">{u.email}</span>
              <span className="user-admin-stats">{u.matchesPlayed}경기 · {u.correctCount}적중</span>
            </div>
            <div className="user-admin-badges">
              <span className={u.role === "ADMIN_USER" ? "admin-badge" : "role-chip"}>
                {u.role === "ADMIN_USER" ? "관리자" : "일반"}
              </span>
              <span className={u.active ? "active-chip" : "banned-chip"}>
                {u.active ? "활성" : "정지"}
              </span>
            </div>
            <div className="user-admin-actions">
              {!isMe ? (
                <>
                  <button
                    type="button"
                    className="small-btn"
                    onClick={() => handleRoleChange(u)}
                  >
                    {u.role === "ADMIN_USER" ? "일반으로" : "관리자로"}
                  </button>
                  <button
                    type="button"
                    className={`small-btn ${u.active ? "danger-btn" : ""}`}
                    onClick={() => handleStatusChange(u)}
                  >
                    {u.active ? "정지" : "활성화"}
                  </button>
                </>
              ) : (
                <span className="self-note">본인 계정</span>
              )}
            </div>
          </div>
        );
      })}
      {totalPages > 1 && (
        <div className="pager">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>◀</button>
          <span>{page + 1} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>▶</button>
        </div>
      )}
    </div>
  );
}

function AdminDataTab() {
  const [pollMin, setPollMin] = useState("");
  const [currentPoll, setCurrentPoll] = useState(null);
  const [pastDays, setPastDays] = useState("7");
  const [futureDays, setFutureDays] = useState("14");
  const [syncDate, setSyncDate] = useState("");
  const [singleMatchId, setSingleMatchId] = useState("");
  const [standingsCompId, setStandingsCompId] = useState("");
  const [aiMatchId, setAiMatchId] = useState("");
  const [aiForce, setAiForce] = useState(false);
  const [searchTeam1, setSearchTeam1] = useState("");
  const [searchTeam2, setSearchTeam2] = useState("");
  const [searchComp, setSearchComp] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState("");

  useEffect(() => {
    fotmobAdminApi.getPollInterval()
      .then((d) => setCurrentPoll(typeof d === "number" ? d : d?.minutes ?? d))
      .catch(() => {});
  }, []);

  async function run(label, fn) {
    setLoading(label);
    setMsg("");
    try {
      await fn();
      setMsg(`✅ ${label} 완료`);
    } catch (err) {
      setMsg(`❌ ${label} 실패: ${err.message}`);
    } finally {
      setLoading("");
    }
  }

  function today() {
    // KST 기준 오늘 날짜(YYYYMMDD). toISOString은 UTC라 한국 새벽에 하루 어긋난다.
    return formatDateInputValue(new Date()).replace(/-/g, "");
  }

  async function handleSearch() {
    if (!searchTeam1 && !searchTeam2) {
      setMsg("❌ 팀명을 하나 이상 입력해주세요.");
      return;
    }
    setLoading("FotMob 검색");
    setMsg("");
    setSearchResult(null);
    try {
      const data = await fotmobAdminApi.searchMatch({
        team1: searchTeam1,
        team2: searchTeam2,
        competition: searchComp,
      });
      setSearchResult(data);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        setMsg("검색 결과가 없습니다.");
      }
    } catch (err) {
      setMsg(`❌ FotMob 검색 실패: ${err.message}`);
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="admin-section admin-data-tab">
      {msg && <p className={`action-msg ${msg.startsWith("✅") ? "ok" : "err"}`}>{msg}</p>}

      {/* 일정 동기화 */}
      <div className="data-card">
        <h3 className="data-card-title">📅 일정 동기화</h3>
        <div className="data-row">
          <label>과거</label>
          <input
            type="number" min="1" max="30" value={pastDays}
            onChange={(e) => setPastDays(e.target.value)}
            className="data-input short"
          />
          <span>일 / 미래</span>
          <input
            type="number" min="1" max="30" value={futureDays}
            onChange={(e) => setFutureDays(e.target.value)}
            className="data-input short"
          />
          <span>일</span>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading)}
            onClick={() => run("범위 동기화", () =>
              fotmobAdminApi.syncSchedule({
                pastDays: Number(pastDays),
                futureDays: Number(futureDays),
              })
            )}
          >
            {loading === "범위 동기화" ? "진행 중…" : "동기화"}
          </button>
        </div>
        <div className="data-row">
          <label>특정 날짜</label>
          <input
            type="date"
            value={syncDate ? `${syncDate.slice(0,4)}-${syncDate.slice(4,6)}-${syncDate.slice(6,8)}` : ""}
            onChange={(e) => setSyncDate(e.target.value.replace(/-/g, ""))}
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !syncDate}
            onClick={() => run(`${syncDate} 동기화`, () => fotmobAdminApi.syncDate(syncDate))}
          >
            {loading === `${syncDate} 동기화` ? "진행 중…" : "동기화"}
          </button>
          <button
            type="button"
            className="data-btn secondary"
            disabled={Boolean(loading)}
            onClick={() => { setSyncDate(today()); }}
          >
            오늘
          </button>
        </div>
      </div>

      {/* 단일 경기 동기화 */}
      <div className="data-card">
        <h3 className="data-card-title">🔁 단일 경기 동기화</h3>
        <p className="data-hint">DB 경기 ID로 라인업·이벤트·스코어를 즉시 갱신합니다.</p>
        <div className="data-row">
          <label>경기 ID</label>
          <input
            type="number" min="1" value={singleMatchId}
            onChange={(e) => setSingleMatchId(e.target.value)}
            placeholder="Match DB ID"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !singleMatchId}
            onClick={() => run(`경기 ${singleMatchId} 동기화`, () =>
              fotmobAdminApi.syncMatch(Number(singleMatchId))
            )}
          >
            {loading === `경기 ${singleMatchId} 동기화` ? "진행 중…" : "동기화"}
          </button>
        </div>
      </div>

      {/* 순위 갱신 */}
      <div className="data-card">
        <h3 className="data-card-title">📊 순위 강제 갱신</h3>
        <p className="data-hint">Competition 내부 ID로 리그 순위를 즉시 갱신합니다. (월드컵 = 6)</p>
        <div className="data-row">
          <label>Competition ID</label>
          <input
            type="number" min="1" value={standingsCompId}
            onChange={(e) => setStandingsCompId(e.target.value)}
            placeholder="Competition DB ID"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !standingsCompId}
            onClick={() => run(`순위 갱신(${standingsCompId})`, () =>
              fotmobAdminApi.syncStandings(Number(standingsCompId))
            )}
          >
            {loading === `순위 갱신(${standingsCompId})` ? "진행 중…" : "갱신"}
          </button>
        </div>
      </div>

      {/* AI 승률 예측 */}
      <div className="data-card">
        <h3 className="data-card-title">🤖 AI 승률 예측 생성</h3>
        <p className="data-hint">선택한 경기의 AI 승률을 Gemini로 생성합니다. 종료·취소 경기는 거절됩니다.</p>
        <div className="data-row">
          <label>경기 ID</label>
          <input
            type="number" min="1" value={aiMatchId}
            onChange={(e) => setAiMatchId(e.target.value)}
            placeholder="Match DB ID"
            className="data-input"
          />
          <label className="data-check-label">
            <input
              type="checkbox"
              checked={aiForce}
              onChange={(e) => setAiForce(e.target.checked)}
            />
            강제 재생성
          </label>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !aiMatchId}
            onClick={() => run(`AI 예측(${aiMatchId})`, () =>
              adminApi.predictAi(Number(aiMatchId), { force: aiForce })
            )}
          >
            {loading === `AI 예측(${aiMatchId})` ? "생성 중…" : "생성"}
          </button>
        </div>
      </div>

      {/* FotMob 검색 */}
      <div className="data-card">
        <h3 className="data-card-title">🔍 FotMob 경기 검색</h3>
        <p className="data-hint">팀명/대회명으로 FotMob matchId 후보를 검색합니다.</p>
        <div className="data-row">
          <label>팀 1</label>
          <input
            type="text" value={searchTeam1}
            onChange={(e) => setSearchTeam1(e.target.value)}
            placeholder="예: Korea"
            className="data-input"
          />
          <label>팀 2</label>
          <input
            type="text" value={searchTeam2}
            onChange={(e) => setSearchTeam2(e.target.value)}
            placeholder="예: Japan"
            className="data-input"
          />
        </div>
        <div className="data-row">
          <label>대회</label>
          <input
            type="text" value={searchComp}
            onChange={(e) => setSearchComp(e.target.value)}
            placeholder="예: World Cup (선택)"
            className="data-input"
          />
          <button
            type="button"
            className="data-btn"
            disabled={loading === "FotMob 검색"}
            onClick={handleSearch}
          >
            {loading === "FotMob 검색" ? "검색 중…" : "검색"}
          </button>
        </div>
        {searchResult && (
          <div className="data-result">
            <pre>{JSON.stringify(searchResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* 폴링 주기 */}
      <div className="data-card">
        <h3 className="data-card-title">⏱ 폴링 주기</h3>
        {currentPoll !== null && (
          <p className="data-hint">현재: {currentPoll}분마다 갱신</p>
        )}
        <div className="data-row">
          <label>새 주기</label>
          <input
            type="number" min="1" max="60" value={pollMin}
            onChange={(e) => setPollMin(e.target.value)}
            placeholder="분"
            className="data-input short"
          />
          <span>분</span>
          <button
            type="button"
            className="data-btn"
            disabled={Boolean(loading) || !pollMin}
            onClick={() => run("폴링 주기 변경", async () => {
              await fotmobAdminApi.setPollInterval(Number(pollMin));
              setCurrentPoll(Number(pollMin));
            })}
          >
            {loading === "폴링 주기 변경" ? "적용 중…" : "적용"}
          </button>
        </div>
        <p className="data-hint">※ 재시작 시 application.yml 값으로 초기화됩니다.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 월드컵 화면
// ─────────────────────────────────────────

const WC_GROUPS = [
  "Grp. A", "Grp. B", "Grp. C", "Grp. D",
  "Grp. E", "Grp. F", "Grp. G", "Grp. H",
  "Grp. I", "Grp. J", "Grp. K", "Grp. L",
];

// FotMob 그룹키 → 표시 문자 (예: "Grp. A" → "A")
function wcGroupLetter(key) {
  return key.replace("Grp. ", "");
}

// 팀 이름 한글화 (countryNameKo 사용)
function teamKo(name) {
  return countryNameKo[name] || name;
}

function WorldCupScreen({ matches, onBack, onSelectMatch }) {
  const [tab, setTab] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState(null);

  const wcMatches = matches.filter((m) => m.isWorldCup);

  function handleTabChange(next) {
    setTab(next);
    setSelectedGroup(null);
  }

  function handleGroupFromBracket(groupKey) {
    setTab("group");
    setSelectedGroup(groupKey);
  }

  const backLabel = selectedGroup ? `← ${wcGroupLetter(selectedGroup)}조` : "← 메인";
  const backAction = selectedGroup ? () => setSelectedGroup(null) : onBack;

  return (
    <div className="wc-page">
      {/* 고정 헤더 */}
      <header className="wc-page-hdr">
        <button type="button" className="wc-page-back" onClick={backAction}>
          {backLabel}
        </button>
        <span className="wc-page-title">🏆 2026 FIFA 월드컵</span>
      </header>

      {/* 고정 탭 바 */}
      <div className="wc-page-tabs">
        <button
          type="button"
          className={`wc-tab ${tab === "group" ? "active" : ""}`}
          onClick={() => handleTabChange("group")}
        >
          조별리그
        </button>
        <button
          type="button"
          className={`wc-tab ${tab === "bracket" ? "active" : ""}`}
          onClick={() => handleTabChange("bracket")}
        >
          토너먼트
        </button>
      </div>

      {/* 스크롤 영역 */}
      <div className={`wc-page-body ${tab === "bracket" ? "is-bracket" : ""}`}>
        {tab === "group" && !selectedGroup && (
          <WcGroupGrid wcMatches={wcMatches} onSelectGroup={setSelectedGroup} />
        )}
        {tab === "group" && selectedGroup && (
          <WcGroupDetail
            groupKey={selectedGroup}
            wcMatches={wcMatches}
            onSelectMatch={onSelectMatch}
          />
        )}
        {tab === "bracket" && (
          <WcBracket wcMatches={wcMatches} onSelectMatch={onSelectMatch} onSelectGroup={handleGroupFromBracket} />
        )}
      </div>
    </div>
  );
}

function WcGroupGrid({ wcMatches, onSelectGroup }) {
  return (
    <div className="wc-group-grid">
      {WC_GROUPS.map((key) => {
        const letter = wcGroupLetter(key);
        const grpMatches = wcMatches.filter((m) => m.group === key);
        const teams = [...new Set([
          ...grpMatches.map((m) => m.homeTeamOriginal).filter(Boolean),
          ...grpMatches.map((m) => m.awayTeamOriginal).filter(Boolean),
        ])];
        const hasData = teams.length > 0;
        return (
          <button
            key={key}
            type="button"
            className={`wc-group-card ${!hasData ? "disabled" : ""}`}
            onClick={hasData ? () => onSelectGroup(key) : undefined}
            disabled={!hasData}
          >
            <span className="wc-group-letter">{letter}조</span>
            <ul className="wc-group-teams">
              {hasData
                ? teams.map((t) => <li key={t}>{teamKo(t)}</li>)
                : <li className="wc-na">TBD</li>}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

function WcGroupDetail({ groupKey, wcMatches, onSelectMatch }) {
  const letter = wcGroupLetter(groupKey);
  const grpMatches = wcMatches
    .filter((m) => m.group === groupKey)
    .sort((a, b) => new Date(a.matchTimeRaw) - new Date(b.matchTimeRaw));

  // 조 내 팀 목록 (승점 정렬은 향후 지원, 현재 이름 순)
  const teams = [...new Set([
    ...grpMatches.map((m) => m.homeTeamOriginal).filter(Boolean),
    ...grpMatches.map((m) => m.awayTeamOriginal).filter(Boolean),
  ])];

  return (
    <div className="wc-group-detail">
      <h2 className="wc-group-detail-title">{letter}조</h2>

      <div className="wc-group-team-list">
        {teams.map((t) => (
          <span key={t} className="wc-team-chip">{teamKo(t)}</span>
        ))}
      </div>

      <div className="wc-group-matches">
        {grpMatches.length === 0 ? (
          <p className="wc-empty">경기 일정이 없습니다.</p>
        ) : (
          grpMatches.map((match) => {
            const finished = ["IN_PLAY", "FINISHED"].includes(match.statusRaw);
            return (
              <button
                key={match.id}
                type="button"
                className="wc-match-row"
                onClick={() => onSelectMatch(match)}
              >
                <span className="wc-match-home">{teamKo(match.homeTeamOriginal) || match.homeTeam}</span>
                <span className="wc-match-score-box">
                  {finished ? (
                    <>
                      <strong className={`wc-score ${match.statusRaw === "IN_PLAY" ? "live" : ""}`}>
                        {match.score}
                      </strong>
                      {match.statusRaw === "IN_PLAY" && <LiveClock match={match} />}
                    </>
                  ) : (
                    <span className="wc-match-time">{match.matchTime}</span>
                  )}
                  <em className={`wc-status-dot ${match.statusRaw?.toLowerCase() ?? ""}`} />
                </span>
                <span className="wc-match-away">{teamKo(match.awayTeamOriginal) || match.awayTeam}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── 토너먼트 브래킷 (중심 대칭) ─────────────────────────────────────────────
const B_SLOT_H  = 72;   // R32 한 슬롯 높이(px)
const B_BOX_H   = 58;   // 매치 박스 높이(px)
const B_BOX_W   = 130;  // 매치 박스 너비(px)
const B_COL_GAP = 40;   // 라운드 사이 간격(px)
const B_HDR_H   = 26;   // 라운드 라벨 높이(px)
const B_GRP_W   = 108;  // 그룹 미니 패널 너비(px)
const B_CTR_W   = 148;  // 결승 박스 너비(px)

// X 좌표 계산
const B_GP_L  = 0;
const B_R32_L = B_GRP_W + B_COL_GAP;                        // 148
const B_R16_L = B_R32_L + B_BOX_W + B_COL_GAP;              // 318
const B_QF_L  = B_R16_L + B_BOX_W + B_COL_GAP;              // 488
const B_SF_L  = B_QF_L  + B_BOX_W + B_COL_GAP;              // 658
const B_CTR   = B_SF_L  + B_BOX_W + B_COL_GAP;              // 828
const B_SF_R  = B_CTR   + B_CTR_W + B_COL_GAP;              // 1016
const B_QF_R  = B_SF_R  + B_BOX_W + B_COL_GAP;              // 1186
const B_R16_R = B_QF_R  + B_BOX_W + B_COL_GAP;              // 1356
const B_R32_R = B_R16_R + B_BOX_W + B_COL_GAP;              // 1526
const B_GP_R  = B_R32_R + B_BOX_W + B_COL_GAP;              // 1696
const B_TOTAL_W = B_GP_R + B_GRP_W;                          // 1804
const B_TOTAL_H = B_HDR_H + 8 * B_SLOT_H + B_BOX_H + 28;   // 714

// 슬롯 중심 Y: roundIdx(0=R32..3=SF), slotIdx
function bSlotY(roundIdx, slotIdx) {
  const span = Math.pow(2, roundIdx);
  return B_HDR_H + B_SLOT_H * (slotIdx * span + span / 2);
}

// 왼쪽/오른쪽 커넥터 정의 (SF→Final은 별도)
const B_LEFT_COLS = [
  { x: B_R32_L, nextX: B_R16_L, count: 8, ri: 0 },
  { x: B_R16_L, nextX: B_QF_L,  count: 4, ri: 1 },
  { x: B_QF_L,  nextX: B_SF_L,  count: 2, ri: 2 },
];
const B_RIGHT_COLS = [
  { x: B_R32_R, nextX: B_R16_R, count: 8, ri: 0 },
  { x: B_R16_R, nextX: B_QF_R,  count: 4, ri: 1 },
  { x: B_QF_R,  nextX: B_SF_R,  count: 2, ri: 2 },
];

function WcBracket({ wcMatches, onSelectMatch, onSelectGroup }) {
  // ── 자동 스케일: 컨테이너 너비에 맞게 축소 ──────────────────────────────
  const outerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function measure() {
      if (!outerRef.current) return;
      const avail = outerRef.current.clientWidth - 4; // 여유 4px
      setScale(Math.min(1, avail / B_TOTAL_W));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── 데이터 매핑 ──────────────────────────────────────────────────────────
  const knockoutByRound = {};
  wcMatches
    .filter((m) => m.group && !m.group.startsWith("Grp.") && m.group !== "일정")
    .forEach((m) => {
      if (!knockoutByRound[m.group]) knockoutByRound[m.group] = [];
      knockoutByRound[m.group].push(m);
    });

  function getSorted(roundKey) {
    return (knockoutByRound[roundKey] || []).sort(
      (a, b) => new Date(a.matchTimeRaw) - new Date(b.matchTimeRaw),
    );
  }
  function getSlot(roundKey, idx) {
    return getSorted(roundKey)[idx] || null;
  }

  // ── 매치 박스 ────────────────────────────────────────────────────────────
  function Box({ roundKey, slotIdx, x, centerY, w }) {
    const bw = w || B_BOX_W;
    const match = getSlot(roundKey, slotIdx);
    const has = Boolean(match);
    return (
      <div
        key={`bx-${roundKey}-${slotIdx}`}
        className={`wc-bracket-box ${has ? "has-match" : "na"}`}
        style={{ position: "absolute", left: x, top: centerY - B_BOX_H / 2, width: bw, height: B_BOX_H }}
        role={has ? "button" : undefined}
        tabIndex={has ? 0 : undefined}
        onClick={has ? () => onSelectMatch(match) : undefined}
        onKeyDown={has ? (e) => e.key === "Enter" && onSelectMatch(match) : undefined}
      >
        {has ? (
          <>
            <span className="wc-box-team home">{teamKo(match.homeTeamOriginal) || match.homeTeam}</span>
            <span className="wc-box-score">
              {["IN_PLAY", "FINISHED"].includes(match.statusRaw)
                ? match.statusRaw === "IN_PLAY"
                  ? <><span>{match.score}</span><LiveClock match={match} /></>
                  : match.score
                : match.matchTime.split(" ")[0]}
            </span>
            <span className="wc-box-team away">{teamKo(match.awayTeamOriginal) || match.awayTeam}</span>
          </>
        ) : (
          <span className="wc-na-text">NA</span>
        )}
      </div>
    );
  }

  // ── 라운드 라벨 ──────────────────────────────────────────────────────────
  function Label({ text, x, w }) {
    return (
      <div
        key={`lbl-${x}`}
        className="wc-round-label"
        style={{ position: "absolute", left: x, top: 0, width: w || B_BOX_W, height: B_HDR_H }}
      >
        {text}
      </div>
    );
  }

  // ── SVG 커넥터 (왼쪽: 외곽→중심 좌→우) ──────────────────────────────────
  function leftConnectors() {
    return B_LEFT_COLS.flatMap(({ x, nextX, count, ri }) =>
      Array.from({ length: count / 2 }, (_, pi) => {
        const mi = pi * 2;
        const y1 = bSlotY(ri, mi);
        const y2 = bSlotY(ri, mi + 1);
        const yN = bSlotY(ri + 1, pi);
        const sx = x + B_BOX_W;
        const dx = nextX;
        const mx = sx + (dx - sx) * 0.5;
        return (
          <g key={`lc-${ri}-${pi}`} className="bracket-connector">
            <line x1={sx} y1={y1} x2={mx} y2={y1} />
            <line x1={sx} y1={y2} x2={mx} y2={y2} />
            <line x1={mx} y1={y1} x2={mx} y2={y2} />
            <line x1={mx} y1={yN} x2={dx} y2={yN} />
          </g>
        );
      }),
    );
  }

  // ── SVG 커넥터 (오른쪽: 외곽→중심 우→좌) ────────────────────────────────
  function rightConnectors() {
    return B_RIGHT_COLS.flatMap(({ x, nextX, count, ri }) =>
      Array.from({ length: count / 2 }, (_, pi) => {
        const mi = pi * 2;
        const y1 = bSlotY(ri, mi);
        const y2 = bSlotY(ri, mi + 1);
        const yN = bSlotY(ri + 1, pi);
        const sx = x;
        const dx = nextX + B_BOX_W;
        const mx = (sx + dx) / 2;
        return (
          <g key={`rc-${ri}-${pi}`} className="bracket-connector">
            <line x1={sx} y1={y1} x2={mx} y2={y1} />
            <line x1={sx} y1={y2} x2={mx} y2={y2} />
            <line x1={mx} y1={y1} x2={mx} y2={y2} />
            <line x1={mx} y1={yN} x2={dx} y2={yN} />
          </g>
        );
      }),
    );
  }

  // ── SF → Final 직선 커넥터 ───────────────────────────────────────────────
  const finalY = bSlotY(3, 0);
  function finalConnectors() {
    return [
      <g key="fc-l" className="bracket-connector">
        <line x1={B_SF_L + B_BOX_W} y1={finalY} x2={B_CTR} y2={finalY} />
      </g>,
      <g key="fc-r" className="bracket-connector">
        <line x1={B_SF_R} y1={finalY} x2={B_CTR + B_CTR_W} y2={finalY} />
      </g>,
    ];
  }

  // ── 그룹 미니 패널 ───────────────────────────────────────────────────────
  const leftGroups  = WC_GROUPS.slice(0, 6);
  const rightGroups = WC_GROUPS.slice(6, 12);
  const gpSlotH = (8 * B_SLOT_H) / 6;

  function GroupMini({ groupKey, panelIdx, x }) {
    const letter = wcGroupLetter(groupKey);
    const grpMs  = wcMatches.filter((m) => m.group === groupKey);
    const teams  = [...new Set([
      ...grpMs.map((m) => m.homeTeamOriginal).filter(Boolean),
      ...grpMs.map((m) => m.awayTeamOriginal).filter(Boolean),
    ])];
    const hasTeams = teams.length > 0;
    const top = B_HDR_H + panelIdx * gpSlotH;
    return (
      <div
        key={groupKey}
        className={`wc-mini-group ${hasTeams && onSelectGroup ? "clickable" : ""}`}
        style={{ position: "absolute", left: x, top, width: B_GRP_W, height: gpSlotH - 4 }}
        role={hasTeams && onSelectGroup ? "button" : undefined}
        tabIndex={hasTeams && onSelectGroup ? 0 : undefined}
        onClick={hasTeams && onSelectGroup ? () => onSelectGroup(groupKey) : undefined}
        onKeyDown={hasTeams && onSelectGroup ? (e) => e.key === "Enter" && onSelectGroup(groupKey) : undefined}
      >
        <div className="wc-mini-letter">{letter}조</div>
        <div className="wc-mini-teams">
          {hasTeams
            ? teams.slice(0, 4).map((t) => <div key={t} className="wc-mini-team">{teamKo(t)}</div>)
            : <div className="wc-mini-team">-</div>}
        </div>
      </div>
    );
  }

  // 3위 결정전: Final 박스 하단에서 충분한 여백 확보
  const finalBoxBottom = finalY + B_BOX_H / 2;
  const thirdLblTop    = finalBoxBottom + 10;
  const thirdY         = thirdLblTop + 16 + 8 + B_BOX_H / 2; // label(16px) + gap(8px) + half-box

  // 스케일 적용 시 시각적 크기
  const scaledW = Math.round(B_TOTAL_W * scale);
  const scaledH = Math.round(B_TOTAL_H * scale);

  return (
    <div ref={outerRef} className="wc-bracket-outer">
      {/* 스케일 1일 때(= 원본 크기가 너무 클 때)만 힌트 표시 */}
      {scale < 0.99 && (
        <p className="wc-bracket-hint">← 좌우로 스크롤하세요</p>
      )}

      {/* 스케일 래퍼: 시각적 크기로 공간 확보 + 가운데 정렬 */}
      <div style={{ width: scaledW, height: scaledH, margin: "0 auto", overflow: "hidden" }}>
        <div
          style={{
            transformOrigin: "top left",
            transform: `scale(${scale})`,
            width: B_TOTAL_W,
            height: B_TOTAL_H,
          }}
        >
          <div className="wc-bracket-canvas" style={{ width: B_TOTAL_W, height: B_TOTAL_H }}>
            {/* SVG 커넥터 */}
            <svg
              width={B_TOTAL_W}
              height={B_TOTAL_H}
              style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            >
              {leftConnectors()}
              {rightConnectors()}
              {finalConnectors()}
            </svg>

            {/* 라운드 라벨 */}
            <Label text="32강"    x={B_R32_L} />
            <Label text="16강"    x={B_R16_L} />
            <Label text="8강"     x={B_QF_L} />
            <Label text="4강"     x={B_SF_L} />
            <Label text="🏆 결승" x={B_CTR}   w={B_CTR_W} />
            <Label text="4강"     x={B_SF_R} />
            <Label text="8강"     x={B_QF_R} />
            <Label text="16강"    x={B_R16_R} />
            <Label text="32강"    x={B_R32_R} />

            {/* 왼쪽 R32 (8) */}
            {Array.from({ length: 8 }, (_, i) => (
              <Box key={`lr32-${i}`} roundKey="Round of 32"   slotIdx={i}     x={B_R32_L} centerY={bSlotY(0, i)} />
            ))}
            {/* 왼쪽 R16 (4) */}
            {Array.from({ length: 4 }, (_, i) => (
              <Box key={`lr16-${i}`} roundKey="Round of 16"   slotIdx={i}     x={B_R16_L} centerY={bSlotY(1, i)} />
            ))}
            {/* 왼쪽 QF (2) */}
            {Array.from({ length: 2 }, (_, i) => (
              <Box key={`lqf-${i}`}  roundKey="Quarter-final" slotIdx={i}     x={B_QF_L}  centerY={bSlotY(2, i)} />
            ))}
            {/* 왼쪽 SF (1) */}
            <Box key="lsf" roundKey="Semi-final" slotIdx={0} x={B_SF_L} centerY={finalY} />

            {/* 중앙: 결승 */}
            <Box key="final" roundKey="Final" slotIdx={0} x={B_CTR} centerY={finalY} w={B_CTR_W} />

            {/* 3위 결정전 라벨 + 박스 */}
            <div
              style={{
                position: "absolute", left: B_CTR, top: thirdLblTop,
                width: B_CTR_W, textAlign: "center", fontSize: 11, color: "#888", fontWeight: 700,
                letterSpacing: "0.3px",
              }}
            >
              3위 결정전
            </div>
            <Box key="third" roundKey="Third place play-off" slotIdx={0} x={B_CTR} centerY={thirdY} w={B_CTR_W} />

            {/* 오른쪽 SF (1) */}
            <Box key="rsf" roundKey="Semi-final" slotIdx={1} x={B_SF_R} centerY={finalY} />
            {/* 오른쪽 QF (2) */}
            {Array.from({ length: 2 }, (_, i) => (
              <Box key={`rqf-${i}`}  roundKey="Quarter-final" slotIdx={i + 2} x={B_QF_R}  centerY={bSlotY(2, i)} />
            ))}
            {/* 오른쪽 R16 (4) */}
            {Array.from({ length: 4 }, (_, i) => (
              <Box key={`rr16-${i}`} roundKey="Round of 16"   slotIdx={i + 4} x={B_R16_R} centerY={bSlotY(1, i)} />
            ))}
            {/* 오른쪽 R32 (8) */}
            {Array.from({ length: 8 }, (_, i) => (
              <Box key={`rr32-${i}`} roundKey="Round of 32"   slotIdx={i + 8} x={B_R32_R} centerY={bSlotY(0, i)} />
            ))}

            {/* 그룹 미니 패널 — A~F 왼쪽, G~L 오른쪽 */}
            {leftGroups.map((gk, pi) => (
              <GroupMini key={gk} groupKey={gk} panelIdx={pi} x={B_GP_L} />
            ))}
            {rightGroups.map((gk, pi) => (
              <GroupMini key={gk} groupKey={gk} panelIdx={pi} x={B_GP_R} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
