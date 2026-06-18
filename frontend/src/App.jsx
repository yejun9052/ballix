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
const StandingsScreen = lazy(() => import("./pages/StandingsScreen.jsx").then((m) => ({ default: m.StandingsScreen })));
const AdminScreen = lazy(() => import("./pages/AdminScreen.jsx").then((m) => ({ default: m.AdminScreen })));
const MyPageScreen = lazy(() => import("./pages/MyPageScreen.jsx").then((m) => ({ default: m.MyPageScreen })));
const WorldCupScreen = lazy(() => import("./components/worldcup/WorldCupScreen.jsx").then((m) => ({ default: m.WorldCupScreen })));

// 온보딩(첫 로그인 닉네임 설정) 완료 플래그 키 — 유저별 1회
const onboardKey = (userId) => `ballix-onboarded-${userId}`;

// 청크 로딩 중 표시할 폴백
function ScreenFallback() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)", fontWeight: 700 }}>
      불러오는 중…
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("main");
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showNameSetup, setShowNameSetup] = useState(false);
  const isLoggedIn = Boolean(currentUser);
  const isAdmin = currentUser?.role === "ADMIN_USER";

  // 첫 로그인(이 기기에서 온보딩 미완료)이면 닉네임 설정 모달을 띄운다.
  useEffect(() => {
    if (currentUser && !localStorage.getItem(onboardKey(currentUser.id))) {
      setShowNameSetup(true);
    } else {
      setShowNameSetup(false);
    }
  }, [currentUser]);

  // 닉네임 변경을 currentUser에 반영(마이페이지·모달 공용)
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
  // 백엔드가 갱신한 스코어·이벤트·하프타임/종료·clockRunning 을 재반영한다.
  // 백엔드 라이브 빠른 폴링이 20초 주기라 프론트도 20초로 맞춰 HT/골/종료가 빨리 뜨게 한다.
  const hasLiveMatch = matches.some((match) => match.statusRaw === "IN_PLAY");
  useEffect(() => {
    if (!hasLiveMatch) {
      return undefined;
    }
    const id = setInterval(() => loadMatches({ silent: true }), 20000);
    return () => clearInterval(id);
  }, [hasLiveMatch]);

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
  } else if (screen === "standings") {
    view = <StandingsScreen user={currentUser} onBack={() => setScreen("main")} />;
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
  } else if (screen === "detail") {
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
        onOpenStandings={() => setScreen("standings")}
        onOpenWorldCup={() => setScreen("worldcup")}
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

