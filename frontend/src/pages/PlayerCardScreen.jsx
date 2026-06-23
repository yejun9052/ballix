// 선수 카드 뽑기 화면 — 1회/10회 뽑기 + 내 컬렉션
import { useState, useCallback } from "react";
import { drawPlayerCard, getMyCards } from "../api/playerCard.js";
import "../styles/player-card-screen.css";

// 등급별 설정
const GRADE_CONFIG = {
  "레전드":    { color: "#ff5ec4", glow: 3, border: "#ff5ec4" },
  "월드클래스": { color: "#a855f7", glow: 2, border: "#a855f7" },
  "탑 클래스":  { color: "#e0b341", glow: 1, border: "#e0b341" },
  "프로":      { color: "#9aa4b2", glow: 0, border: "#9aa4b2" },
  "세미프로":  { color: "#a97142", glow: 0, border: "#a97142" },
  "아마추어":  { color: "#6b7280", glow: 0, border: "#888" },
};

function getGradeConfig(grade) {
  return GRADE_CONFIG[grade] ?? { color: "#888", glow: 0, border: "#888" };
}

// 카드 단일 컴포넌트
function SoccerCard({ card, index = 0, compact = false }) {
  const cfg = getGradeConfig(card.grade);
  return (
    <div
      className={`sc-card sc-glow-${cfg.glow} ${compact ? "sc-compact" : ""}`}
      style={{ "--gc": cfg.color, "--gb": cfg.border, animationDelay: `${index * 60}ms` }}
    >
      <div className="sc-top">
        <span className="sc-overall">{card.overall ?? "?"}</span>
        <span className="sc-pos">{card.position || "-"}</span>
      </div>
      <div className="sc-img">
        {card.imageUrl
          ? <img src={card.imageUrl} alt={card.playerName} loading="lazy" />
          : <div className="sc-no-img">⚽</div>
        }
      </div>
      <div className="sc-body">
        <div className="sc-name" title={card.playerName}>{card.playerName}</div>
        <div className="sc-team">{card.team}</div>
        <div className="sc-foot">
          <span className="sc-grade-badge">{card.grade}</span>
          <span className="sc-nat">{card.nationality}</span>
        </div>
      </div>
    </div>
  );
}

// 뽑기 결과 화면
function RevealScreen({ cards, onReset }) {
  return (
    <div className="sc-reveal">
      <div className="sc-reveal-header">
        <strong>⚽ {cards.length}명 획득!</strong>
        <button type="button" className="sc-btn sc-btn-primary" onClick={onReset}>
          다시 뽑기
        </button>
      </div>
      <div className={`sc-grid ${cards.length === 1 ? "sc-grid-single" : ""}`}>
        {cards.map((c, i) => <SoccerCard key={`${c.id}-${i}`} card={c} index={i} />)}
      </div>
    </div>
  );
}

// 내 컬렉션 탭
function CollectionTab({ isLoggedIn }) {
  const [cards, setCards] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const data = await getMyCards();
      setCards(Array.isArray(data) ? data : []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // 첫 렌더 시 자동 로드
  useState(() => { load(); }, []);

  if (!isLoggedIn) {
    return <p className="sc-empty">로그인 후 내 컬렉션을 확인할 수 있습니다.</p>;
  }
  if (loading) return <p className="sc-empty">불러오는 중…</p>;
  if (cards === null) {
    return (
      <div className="sc-collection-load">
        <button type="button" className="sc-btn sc-btn-secondary" onClick={load}>
          컬렉션 불러오기
        </button>
      </div>
    );
  }
  if (cards.length === 0) return <p className="sc-empty">아직 뽑은 카드가 없습니다.</p>;

  return (
    <div>
      <p className="sc-collection-count">총 {cards.length}장</p>
      <div className="sc-grid sc-grid-compact">
        {cards.map((c) => <SoccerCard key={c.id} card={c} compact />)}
      </div>
    </div>
  );
}

// 메인 화면
export function PlayerCardScreen({ isLoggedIn, onBack }) {
  const [tab, setTab] = useState("draw"); // "draw" | "collection"
  const [phase, setPhase] = useState("entry"); // "entry" | "drawing" | "reveal"
  const [result, setResult] = useState(null);

  async function draw(count) {
    if (!isLoggedIn) { return; }
    if (phase === "drawing") return;
    setPhase("drawing");
    try {
      const cards = await drawPlayerCard(count);
      setResult(Array.isArray(cards) ? cards : []);
      setPhase("reveal");
    } catch {
      setPhase("entry");
    }
  }

  function reset() {
    setResult(null);
    setPhase("entry");
  }

  return (
    <div className="sc-screen">
      {/* 상단 헤더 */}
      <div className="sc-header">
        <button type="button" className="sc-back-btn" onClick={onBack}>← 돌아가기</button>
        <h1 className="sc-title">⚽ 선수 카드 뽑기</h1>
        <p className="sc-subtitle">전 세계 명문 클럽 선수들을 수집하세요 · 테스트 버전</p>
      </div>

      {/* 탭 */}
      <div className="sc-tabs">
        <button
          type="button"
          className={`sc-tab ${tab === "draw" ? "active" : ""}`}
          onClick={() => { setTab("draw"); reset(); }}
        >
          뽑기
        </button>
        <button
          type="button"
          className={`sc-tab ${tab === "collection" ? "active" : ""}`}
          onClick={() => setTab("collection")}
        >
          내 컬렉션
        </button>
      </div>

      <div className="sc-content">
        {tab === "draw" && (
          <>
            {phase === "reveal" && result ? (
              <RevealScreen cards={result} onReset={reset} />
            ) : (
              <div className="sc-entry">
                {/* 팩 아트 */}
                <div className="sc-pack-art">
                  <div className="sc-pack-ball">⚽</div>
                  <div className="sc-pack-label">FOOTBALL PACK</div>
                  <p className="sc-pack-desc">명문 15개 클럽 · 레전드~아마추어 6등급</p>
                </div>

                {/* 등급표 */}
                <div className="sc-grade-table">
                  {Object.entries(GRADE_CONFIG).reverse().map(([label, cfg]) => (
                    <div key={label} className="sc-grade-row">
                      <span className="sc-grade-dot" style={{ background: cfg.color }} />
                      <span className="sc-grade-name" style={{ color: cfg.color }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* 뽑기 버튼 */}
                {!isLoggedIn ? (
                  <p className="sc-empty">로그인 후 뽑기가 가능합니다.</p>
                ) : (
                  <div className="sc-draw-btns">
                    <button
                      type="button"
                      className="sc-btn sc-btn-primary sc-btn-lg"
                      onClick={() => draw(1)}
                      disabled={phase === "drawing"}
                    >
                      {phase === "drawing" ? "뽑는 중…" : "1회 뽑기"}
                    </button>
                    <button
                      type="button"
                      className="sc-btn sc-btn-accent sc-btn-lg"
                      onClick={() => draw(10)}
                      disabled={phase === "drawing"}
                    >
                      {phase === "drawing" ? "뽑는 중…" : "10회 뽑기"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === "collection" && <CollectionTab isLoggedIn={isLoggedIn} />}
      </div>
    </div>
  );
}
