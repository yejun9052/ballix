// 경기 상세 화면 — 라인업·이벤트·AI승률·골요약·승부예측
import { useEffect, useState } from "react";
import { getFotmobView, getAiSummary, getHighlight } from "../api/match.js";
import { SidebarAds } from "../components/common/AdBanner.jsx";
import { TeamCrest } from "../components/common/TeamCrest.jsx";
import { StateMessage } from "../components/common/StateMessage.jsx";
import { LiveClock } from "../components/common/LiveClock.jsx";
import { CollapsiblePanel } from "../components/common/CollapsiblePanel.jsx";
import { PlayerModal } from "../components/common/PlayerModal.jsx";
import { LineupSection } from "../components/lineup/LineupSection.jsx";
import { Lineup3DViewer } from "../components/lineup/Lineup3DViewer.jsx";
import { BenchSection } from "../components/lineup/BenchSection.jsx";
import { EventTimeline } from "../components/lineup/EventTimeline.jsx";
import { PredictionPanel } from "../components/match/PredictionPanel.jsx";
import { AiProbabilityCard } from "../components/match/AiProbabilityCard.jsx";
import { AiHistoryTimeline } from "../components/match/AiHistoryTimeline.jsx";
import { ReplayPanel } from "../components/match/ReplayPanel.jsx";
import { CommentSection } from "../components/match/CommentSection.jsx";

export function DetailScreen({ isAdmin, isLoggedIn, match, onBack, onGenerateAi, onLogin, onOpenMyPage, user }) {
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

  // 하이라이트 자동 조회 (종료 경기, 수동 등록 영상 없을 때만)
  const [highlightId, setHighlightId] = useState("");

  // 선수 상세 모달 (라인업/벤치 선수 클릭)
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const matchId = match?.id;
  const matchStatus = match?.statusRaw;
  const manualReplayId = match?.raw?.replayYoutubeId || "";

  // 최초 로드 (matchId 기준이라 라이브 폴링으로 match 객체가 바뀌어도 깜빡이지 않음)
  useEffect(() => {
    if (!matchId) {
      return undefined;
    }
    let mounted = true;
    setFotmobLoading(true);
    setFotmobError("");
    setFotmob(null);

    getFotmobView(matchId)
      .then((data) => {
        if (mounted) {
          setFotmob(data);
        }
      })
      .catch((error) => {
        if (mounted) {
          setFotmobError(error.response?.data?.msg || "라인업 정보를 불러오지 못했습니다.");
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
      getFotmobView(matchId)
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

  // 종료 경기 + 수동 등록 영상 없음 → 하이라이트 1회 자동 조회(백엔드가 DB-first lazy 검색)
  useEffect(() => {
    if (!matchId || matchStatus !== "FINISHED" || manualReplayId) {
      return undefined;
    }
    let mounted = true;
    getHighlight(matchId)
      .then((data) => {
        if (mounted) setHighlightId(data?.youtubeId || "");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [matchId, matchStatus, manualReplayId]);

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
      setAiActionError(error.response?.data?.msg || "AI 승률 예측을 생성하지 못했습니다.");
    } finally {
      setIsGeneratingAi(false);
    }
  }

  function handleLoadSummary() {
    setSummaryLoading(true);
    setSummaryError("");
    getAiSummary(match.id)
      .then((data) => setAiSummary(data?.summary ?? data))
      .catch((error) => setSummaryError(error.response?.data?.msg || "요약을 불러오지 못했습니다."))
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
      <SidebarAds />
      <section className="detail-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 일정으로</button>
          <strong>경기 상세</strong>
          {!isLoggedIn ? (
            <div className="account-actions">
              <button type="button" onClick={onLogin}>로그인</button>
            </div>
          ) : (
            <div className="account-actions">
              {isAdmin && <span className="admin-badge">관리자</span>}
              <button type="button" className="account-chip account-chip-btn" onClick={onOpenMyPage}>
                {user?.name || "사용자"}
              </button>
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
            onSelectPlayer={setSelectedPlayer}
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
          <Lineup3DViewer
            lineup={lineup}
            homeFormation={homeFormation}
            awayFormation={awayFormation}
          />
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
            <BenchSection match={match} lineup={lineup} events={events} loading={fotmobLoading} onSelectPlayer={setSelectedPlayer} />
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
              <AiHistoryTimeline matchId={match.id} />
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

          {/* 다시보기·하이라이트 — 수동/자동 영상이 있거나 관리자면 노출 */}
          {(manualReplayId || highlightId || isAdmin) && (
            <CollapsiblePanel
              badge="REPLAY"
              className="detail-panel"
              collapsed={collapsedPanels.replay}
              id="replay"
              onToggle={togglePanel}
              title="다시보기·하이라이트"
            >
              <ReplayPanel match={match} isAdmin={isAdmin} highlightId={highlightId} />
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

          <CollapsiblePanel
            badge="COMMENTS"
            className="detail-panel"
            collapsed={collapsedPanels.comments}
            id="comments"
            onToggle={togglePanel}
            title="댓글"
          >
            <CommentSection
              matchId={matchId}
              isLoggedIn={isLoggedIn}
              isAdmin={isAdmin}
              onLogin={onLogin}
            />
          </CollapsiblePanel>
        </section>
      </section>

      {selectedPlayer && (
        <PlayerModal
          playerId={selectedPlayer.fotmobPlayerId}
          fallbackName={selectedPlayer.name}
          matchPlayer={selectedPlayer}
          matchTeamName={selectedPlayer.home ? match.homeTeam : match.awayTeam}
          events={events}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}
