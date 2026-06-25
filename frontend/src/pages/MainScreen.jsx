// 메인 화면 — 경기 일정 목록(필터/라이브/사이드 레일)
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Trophy } from "lucide-react";
import { competitionFilters, aiFilters, WORLD_CUP_LEAGUE_ID } from "../utils/constants.js";
import { getCompetitionFilterValue, compareMatches } from "../utils/match.js";
import { formatDateInputValue, getGroupLabel, getGroupSortValue } from "../utils/format.js";
import { LiveClock } from "../components/common/LiveClock.jsx";
import { StateMessage } from "../components/common/StateMessage.jsx";
import { NoticeBanner } from "../components/common/NoticeBanner.jsx";
import { SiteFooter } from "../components/common/SiteFooter.jsx";
import { ScheduleItem } from "../components/match/ScheduleItem.jsx";
import { HorizontalAd } from "../components/common/AdBanner.jsx";

export function MainScreen({
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
  onOpenPlayerStats,
  onOpenWorldCup,
  onOpenPlayerCard,
  onOpenSquad,
  onOpenAdmin,
  onOpenMyPage,
  onRetryMatches,
  onSelectMatch,
  user,
}) {
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => formatDateInputValue(new Date()));
  const [aiFilter, setAiFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const PAGE_SIZE = 6;

  // 필터 바뀔 때 첫 페이지로
  useEffect(() => { setPage(0); }, [competitionFilter, groupFilter, dateFilter, aiFilter]);

  // 모바일 메뉴 열릴 때 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  function closeMobileMenu() { setMobileMenuOpen(false); }
  function handleMobileNav(fn) { closeMobileMenu(); fn?.(); }
  // 월드컵 조 목록 — 경기 목록이 바뀔 때만 재계산
  const worldCupGroups = useMemo(
    () =>
      [
        ...new Set(
          matches
            .filter((match) => getCompetitionFilterValue(match) === "worldcup")
            .map((match) => match.group)
            .filter((group) => group && group !== "일정"),
        ),
      ].sort((a, b) => getGroupSortValue(a).localeCompare(getGroupSortValue(b))),
    [matches],
  );

  // 필터링·정렬 결과 — 경기 목록/필터값이 바뀔 때만 재계산(매 렌더 반복 방지)
  const { liveMatches, restMatches, filteredCount } = useMemo(() => {
    const filtered = matches.filter((match) => {
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
    const sorted = [...filtered].sort(compareMatches);
    return {
      filteredCount: filtered.length,
      liveMatches: sorted.filter((match) => match.statusRaw === "IN_PLAY"),
      restMatches: sorted.filter((match) => match.statusRaw !== "IN_PLAY"),
    };
  }, [matches, competitionFilter, groupFilter, dateFilter, aiFilter]);

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
          <nav aria-label="주요 메뉴" className="topbar-nav">
            <a href="#matches">경기 일정</a>
            <button type="button" className="nav-link wc-nav-btn" onClick={onOpenWorldCup}>
              월드컵
            </button>
            <button type="button" className="nav-link" onClick={onOpenPlayerStats}>
              개인성적
            </button>
            <button type="button" className="nav-link" onClick={onOpenMyPredictions}>
              내 예측
            </button>
            <button type="button" className="nav-link" onClick={onOpenLeaderboard}>
              랭킹
            </button>
            <button type="button" className="nav-link" onClick={onOpenPlayerCard}>
              카드뽑기
            </button>
            <button type="button" className="nav-link" onClick={onOpenSquad}>
              스쿼드
            </button>
            {isAdmin && (
              <button type="button" className="nav-link admin-nav" onClick={onOpenAdmin}>
                관리자
              </button>
            )}
          </nav>
          {!isLoggedIn ? (
            <div className="account-actions">
              <button type="button" className="topbar-desktop-only" onClick={onLogin}>
                {isAuthLoading ? "확인 중" : "로그인"}
              </button>
            </div>
          ) : (
            <div className="account-actions topbar-desktop-only">
              {typeof user?.pointBalance === "number" && (
                <span
                  className="point-pill"
                  title="보유 포인트 (카드 뽑기에 사용)"
                  style={{
                    fontSize: 13, fontWeight: 800, color: "#7a5b00",
                    background: "#ffe8a3", border: "1px solid #e0c060",
                    borderRadius: 999, padding: "4px 11px",
                  }}
                >
                  {user.pointBalance.toLocaleString()} P
                </span>
              )}
              {isAdmin && <span className="admin-badge">관리자</span>}
              <button type="button" className="account-chip account-chip-btn" onClick={onOpenMyPage}>
                {user?.name || "사용자"}
              </button>
            </div>
          )}
          {/* 모바일 햄버거 */}
          <button
            type="button"
            className="topbar-hamburger"
            aria-label="메뉴 열기"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span /><span /><span />
          </button>
        </header>

        {/* 모바일 전체화면 메뉴 */}
        {mobileMenuOpen && (
          <div className="mobile-menu-overlay" role="dialog" aria-modal="true" aria-label="메뉴">
            <div className="mobile-menu-head">
              <div className="main-logo">
                <span className="brand-pill">BALLIX</span>
                <strong>AI 승부예측</strong>
              </div>
              <button type="button" className="mobile-menu-close" aria-label="메뉴 닫기" onClick={closeMobileMenu}>
                ✕
              </button>
            </div>
            {isLoggedIn && (
              <div className="mobile-menu-user">
                {isAdmin && <span className="admin-badge">관리자</span>}
                <span className="mobile-menu-username">{user?.name || "사용자"}</span>
              </div>
            )}
            <nav className="mobile-menu-nav" aria-label="모바일 메뉴">
              <button type="button" onClick={() => handleMobileNav(null)} data-scroll="#matches">경기 일정</button>
              <button type="button" onClick={() => handleMobileNav(onOpenPlayerStats)}>개인성적</button>
              <button type="button" onClick={() => handleMobileNav(onOpenMyPredictions)}>내 예측</button>
              <button type="button" onClick={() => handleMobileNav(onOpenLeaderboard)}>랭킹</button>
              <button type="button" onClick={() => handleMobileNav(onOpenPlayerCard)}>카드뽑기</button>
              <button type="button" onClick={() => handleMobileNav(onOpenSquad)}>스쿼드</button>
              {isAdmin && (
                <button type="button" className="mobile-menu-admin" onClick={() => handleMobileNav(onOpenAdmin)}>관리자</button>
              )}
            </nav>
            <div className="mobile-menu-footer">
              {!isLoggedIn ? (
                <button type="button" className="mobile-menu-login" onClick={() => handleMobileNav(onLogin)}>
                  {isAuthLoading ? "확인 중…" : "로그인"}
                </button>
              ) : (
                <>
                  <button type="button" className="mobile-menu-mypage" onClick={() => handleMobileNav(onOpenMyPage)}>
                    내 정보 / 설정
                  </button>
                  <button type="button" className="mobile-menu-logout" onClick={() => handleMobileNav(onLogout)}>
                    로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <section className="main-hero">
          <div>
            <span className="brand-pill">MATCH DAY NOTE</span>
            {isLoggedIn ? (
              <>
                <h1>안녕하세요, {user?.name || "사용자"}님!</h1>
                <p>오늘도 경기를 즐겨보세요. AI 승률 확인과 승부예측 기록을 이어서 볼 수 있습니다.</p>
                <button type="button" onClick={onOpenMyPredictions}>내 예측 보기</button>
              </>
            ) : (
              <>
                <h1>오늘 열리는 경기를 먼저 천천히 둘러보세요</h1>
                <p>로그인 전에는 일정과 경기 흐름을 가볍게 확인하고, 로그인 후에는 AI 승률과 나의 승부예측 기록을 이어서 볼 수 있습니다.</p>
                <button type="button" onClick={onLogin}>로그인하고 예측하기</button>
              </>
            )}
          </div>
        </section>

        {/* 환영 메세지 ↔ 경기일정 사이 */}
        <HorizontalAd gridArea="ad-top" />

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
          {!isMatchesLoading && !matchesError && matches.length > 0 && filteredCount === 0 && (
            <StateMessage text="필터에 맞는 경기 일정이 없습니다" />
          )}
          {!isMatchesLoading && !matchesError && restMatches.length > 0 && (() => {
            const totalPages = Math.ceil(restMatches.length / PAGE_SIZE);
            const safePage = Math.min(page, totalPages - 1);
            const pageMatches = restMatches.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
            return (
              <>
                <div className="prediction-feed">
                  {pageMatches.map((item) => (
                    <ScheduleItem
                      item={item}
                      key={item.id}
                      isAdmin={isAdmin}
                      onSelect={onSelectMatch}
                      onGenerateAi={onGenerateAi}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="schedule-pager">
                    <div className="pager">
                      <button disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
                      <span>{safePage + 1} / {totalPages}</span>
                      <button disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        <aside className="side-feed">
          <section className="feed-panel" id="matches">
            <div className="panel-head compact">
              <h2>Live</h2>
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

        {/* 경기일정 ↔ 푸터 사이 */}
        <HorizontalAd gridArea="ad-bot" />

        <SiteFooter />
      </section>
    </main>
  );
}

