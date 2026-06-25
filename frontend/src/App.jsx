// 앱 루트 — 전역 상태(로그인/경기목록/선택경기/화면)와 화면 라우팅 담당
import { lazy, Suspense, useEffect, useState } from "react";
import { loginWithGoogle, logout } from "./api/auth.js";
import { getAllMatches } from "./api/match.js";
import { predictAi } from "./api/admin.js";
import { getMe } from "./api/user.js";
import { normalizeMatch } from "./utils/match.js";
import { getPageContent } from "./utils/format.js";
import { MATCH_LIST_FETCH_SIZE } from "./utils/constants.js";
import { MainScreen } from "./pages/MainScreen.jsx";
import { NameSetupModal } from "./components/common/NameSetupModal.jsx";

// 화면별 코드 스플리팅 — 메인 외 화면은 필요할 때만 청크를 로드해 초기 번들을 줄인다.
const LoginScreen = lazy(() => import("./pages/LoginScreen.jsx").then((m) => ({ default: m.LoginScreen })));
const DetailScreen = lazy(() => import("./pages/DetailScreen.jsx").then((m) => ({ default: m.DetailScreen })));
const LeaderboardScreen = lazy(() => import("./pages/LeaderboardScreen.jsx").then((m) => ({ default: m.LeaderboardScreen })));
const MyPredictionsScreen = lazy(() => import("./pages/MyPredictionsScreen.jsx").then((m) => ({ default: m.MyPredictionsScreen })));
const PlayerStatsScreen = lazy(() => import("./pages/PlayerStatsScreen.jsx").then((m) => ({ default: m.PlayerStatsScreen })));
const AdminScreen = lazy(() => import("./pages/AdminScreen.jsx").then((m) => ({ default: m.AdminScreen })));
const MyPageScreen = lazy(() => import("./pages/MyPageScreen.jsx").then((m) => ({ default: m.MyPageScreen })));
const WorldCupScreen = lazy(() => import("./components/worldcup/WorldCupScreen.jsx").then((m) => ({ default: m.WorldCupScreen })));
const PlayerCardScreen = lazy(() => import("./pages/PlayerCardScreen.jsx").then((m) => ({ default: m.PlayerCardScreen })));
const SquadScreen = lazy(() => import("./pages/SquadScreen.jsx").then((m) => ({ default: m.SquadScreen })));

// 온보딩(첫 로그인 닉네임 설정) 완료 플래그 키 — 유저별 1회
const onboardKey = (userId) => `ballix-onboarded-${userId}`;

// 새로고침해도 보던 화면/경기를 유지하기 위한 localStorage 키
const SCREEN_KEY = "ballix:screen";
const MATCH_KEY = "ballix:matchId";
const readStored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* 무시 */
  }
};

// 라이브 경기가 하프 경계(스토피지 진입/정지) 근처인지 — true면 폴링을 10초로 좁혀
// HT·추가시간·종료가 바로 반영되게 한다(평상시는 20초).
function isLiveNearBoundary(match) {
  const raw = match.raw || match;
  if (raw.status !== "IN_PLAY") return false;
  // 정지(HT 등)면 앵커가 비어있음(clockRunning=false) → 재개를 빨리 잡게 fast
  if (raw.liveStartedAtMs == null || raw.clockRunning === false) return true;
  const base = raw.liveBasePeriod === 90 ? 90 : 45;          // 현재 하프 정규시간 끝(45/90)
  const minute = Math.floor((Date.now() - raw.liveStartedAtMs) / 60000);
  return minute >= base - 1;                                  // 44'+ 또는 89'+ = 스토피지 임박/진입
}

// 청크 로딩 중 표시할 폴백
function ScreenFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)", fontWeight: 700 }}>
      불러오는 중…
    </div>
  );
}

export default function App() {
  // 새로고침 시 직전 화면 복원("login"은 복원하지 않음 — 로그인 직후 재진입 방지)
  const [screen, setScreen] = useState(() => {
    const saved = readStored(SCREEN_KEY);
    return saved && saved !== "login" ? saved : "main";
  });
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showNameSetup, setShowNameSetup] = useState(false);
  const isLoggedIn = Boolean(currentUser);
  const isAdmin = currentUser?.role === "ADMIN_USER";

  // 화면 전환 시 localStorage에 기록(새로고침 복원용). "login"은 저장 안 함.
  useEffect(() => {
    writeStored(SCREEN_KEY, screen === "login" ? null : screen);
  }, [screen]);

  // 선택한 경기 id 기록(상세 화면 복원용).
  useEffect(() => {
    if (selectedMatch?.id != null) writeStored(MATCH_KEY, selectedMatch.id);
  }, [selectedMatch]);

  // 첫 로그인(이 기기에서 온보딩 미완료)이면 닉네임 설정 모달을 띄운다.
  useEffect(() => {
    if (currentUser && !localStorage.getItem(onboardKey(currentUser.id))) {
      setShowNameSetup(true);
    } else {
      setShowNameSetup(false);
    }
  }, [currentUser]);

  // 닉네임 변경을 currentUser에 반영(마이페이지·모달 공용)
  // 포인트 등 내 정보 재조회(카드 뽑기 후 보유 포인트 갱신용)
  function refreshUser() {
    getMe()
      .then((u) => setCurrentUser(u))
      .catch(() => {});
  }

  function applyNameChange(newName) {
    setCurrentUser((prev) => (prev ? { ...prev, name: newName } : prev));
  }

  // 온보딩(첫 로그인 닉네임 설정) 완료
  function finishOnboarding(newName) {
    if (currentUser) {
      localStorage.setItem(onboardKey(currentUser.id), "1");
    }
    applyNameChange(newName);
    setShowNameSetup(false);
  }

  // 다른 기기 로그인으로 세션이 무효화되면(SESSION_REPLACED) 로그아웃 처리하고 로그인 화면으로 보낸다.
  useEffect(() => {
    function handleSessionReplaced() {
      setCurrentUser(null);
      setScreen("login");
    }
    window.addEventListener("ballix:session-replaced", handleSessionReplaced);
    return () => window.removeEventListener("ballix:session-replaced", handleSessionReplaced);
  }, []);

  useEffect(() => {
    let mounted = true;

    getMe()
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
      const response = await getAllMatches({ size: MATCH_LIST_FETCH_SIZE });
      const dbMatches = getPageContent(response);
      const normalizedMatches = [...dbMatches]
        .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime())
        .map(normalizeMatch);

      setMatches(normalizedMatches);
      setSelectedMatch((current) => {
        if (!current) {
          // 새로고침 복원: 저장된 경기 id가 있으면 그 경기를, 없으면 첫 경기를 선택
          const savedId = Number(readStored(MATCH_KEY));
          const restored = savedId
            ? normalizedMatches.find((item) => item.id === savedId)
            : null;
          return restored || normalizedMatches[0] || null;
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
  // 백엔드가 갱신한 스코어·이벤트·하프타임/종료·clockRunning 을 재반영한다.
  // 백엔드 라이브 빠른 폴링이 20초 주기라 프론트도 20초로 맞춰 HT/골/종료가 빨리 뜨게 한다.
  const hasLiveMatch = matches.some((match) => match.statusRaw === "IN_PLAY");
  // 하프 경계(스토피지 진입/정지) 근처면 true — 그때만 폴링을 촘촘히 해 HT·추가시간·종료를 바로 반영한다.
  const pollFast = matches.some(isLiveNearBoundary);
  useEffect(() => {
    if (!hasLiveMatch) {
      return undefined;
    }
    // 경계 근처 10초 / 평상시 20초 — "바로바로" 반영하되 평소엔 과한 폴링 방지.
    const interval = pollFast ? 10000 : 20000;
    const id = setInterval(() => loadMatches({ silent: true }), interval);
    return () => clearInterval(id);
  }, [hasLiveMatch, pollFast]);

  function handleGoogleLogin() {
    loginWithGoogle();
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setCurrentUser(null);
      setScreen("main");
    }
  }

  async function handleGenerateAi(matchId, { force = false } = {}) {
    const updatedMatch = await predictAi(matchId, { force });
    const normalizedMatch = normalizeMatch(updatedMatch);

    setMatches((currentMatches) =>
      currentMatches.map((match) => (match.id === normalizedMatch.id ? normalizedMatch : match)),
    );
    setSelectedMatch((current) =>
      current && current.id === normalizedMatch.id ? normalizedMatch : current,
    );
    return normalizedMatch;
  }

  // 화면 선택 — lazy 컴포넌트가 섞여 있어 Suspense로 감싸 로딩을 처리한다.
  let view;
  if (screen === "login") {
    view = (
      <LoginScreen
        onBack={() => setScreen("main")}
        onPreview={() => setScreen("main")}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  } else if (screen === "leaderboard") {
    view = <LeaderboardScreen user={currentUser} onBack={() => setScreen("main")} />;
  } else if (screen === "myPredictions") {
    view = <MyPredictionsScreen onBack={() => setScreen("main")} />;
  } else if (screen === "playerStats") {
    view = <PlayerStatsScreen user={currentUser} onBack={() => setScreen("main")} />;
  } else if (screen === "worldcup") {
    view = (
      <WorldCupScreen
        matches={matches}
        onBack={() => setScreen("main")}
        onSelectMatch={(match) => {
          setSelectedMatch(match);
          setScreen("detail");
        }}
      />
    );
  } else if (screen === "playerCard") {
    view = (
      <PlayerCardScreen
        isLoggedIn={isLoggedIn}
        user={currentUser}
        onDrawn={refreshUser}
        onBack={() => setScreen("main")}
      />
    );
  } else if (screen === "squad") {
    view = (
      <SquadScreen
        user={currentUser}
        isLoggedIn={isLoggedIn}
        onBack={() => setScreen("main")}
      />
    );
  } else if (screen === "admin" && isAdmin) {
    view = <AdminScreen user={currentUser} onBack={() => setScreen("main")} />;
  } else if (screen === "mypage" && isLoggedIn) {
    view = (
      <MyPageScreen
        user={currentUser}
        onBack={() => setScreen("main")}
        onLogout={handleLogout}
        onUserUpdate={applyNameChange}
      />
    );
  } else if (screen === "detail" && selectedMatch) {
    view = (
      <DetailScreen
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        user={currentUser}
        match={selectedMatch}
        onBack={() => setScreen("main")}
        onGenerateAi={handleGenerateAi}
        onLogin={() => setScreen("login")}
        onLogout={handleLogout}
        onOpenMyPage={() => setScreen("mypage")}
      />
    );
  } else {
    view = (
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
        onOpenPlayerStats={() => setScreen("playerStats")}
        onOpenWorldCup={() => setScreen("worldcup")}
        onOpenPlayerCard={() => setScreen("playerCard")}
        onOpenSquad={() => (isLoggedIn ? setScreen("squad") : setScreen("login"))}
        onOpenAdmin={() => (isAdmin ? setScreen("admin") : null)}
        onOpenMyPage={() => setScreen("mypage")}
        onSelectMatch={(match) => {
          setSelectedMatch(match);
          setScreen("detail");
        }}
      />
    );
  }

  return (
    <Suspense fallback={<ScreenFallback />}>
      {view}
      {showNameSetup && currentUser && (
        <NameSetupModal user={currentUser} onComplete={finishOnboarding} />
      )}
    </Suspense>
  );
}

