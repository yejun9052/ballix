// 선수 카드 뽑기 화면 — 1회/10회 뽑기 + 내 컬렉션(페이지네이션·필터)
import { useState, useCallback, useEffect } from "react";
import { drawPlayerCard, getMyCards } from "../api/playerCard.js";
import "../styles/player-card-screen.css";

// ── 등급 설정 ──────────────────────────────────────────────────────────────
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

// ── 포지션 → 4개 그룹 분류 ────────────────────────────────────────────────
function posGroup(pos) {
  if (!pos || pos.trim() === "") return "";
  const p = pos.toLowerCase().trim();
  if (p === "gk" || p.includes("goalkeeper") || p.includes("keeper")) return "골키퍼";
  if (p === "st" || p === "lw" || p === "rw" || p === "cf" ||
      p.includes("striker") || p.includes("forward") ||
      p.includes("winger") || p.includes("wing")) return "공격수";
  if (p === "cb" || p === "lb" || p === "rb" || p === "rwb" || p === "lwb" ||
      p.includes("back") || p.includes("defender")) return "수비수";
  if (p === "cm" || p === "dm" || p === "am" || p === "cam" ||
      p === "rm" || p === "lm" || p.includes("midfield")) return "미드필더";
  return "";
}

// ── 컬렉션 필터/정렬 옵션 ─────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "overall_desc", label: "오버롤 높은순" },
  { value: "overall_asc",  label: "오버롤 낮은순" },
  { value: "date_desc",    label: "최신 뽑은순" },
  { value: "date_asc",     label: "오래된순" },
];
const POS_GROUPS = ["전체", "공격수", "미드필더", "수비수", "골키퍼"];
const PAGE_SIZES = [12, 24, 36];

// ── 카드 단일 컴포넌트 ────────────────────────────────────────────────────
function SoccerCard({ card, index = 0, compact = false, count = 1 }) {
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
        {count > 1 && <span className="sc-count-badge">×{count}</span>}
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

// ── 뽑기 결과 화면 ────────────────────────────────────────────────────────
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

// ── 내 컬렉션 탭 ──────────────────────────────────────────────────────────
function CollectionTab({ isLoggedIn }) {
  const [cards, setCards]         = useState(null);
  const [loading, setLoading]     = useState(false);
  // 필터/정렬
  const [sort, setSort]           = useState("overall_desc");
  const [posFil, setPosFil]       = useState("전체");
  const [countryFil, setCountryFil] = useState("");
  const [pageSize, setPageSize]   = useState(12);
  const [page, setPage]           = useState(1);

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

  useEffect(() => { load(); }, [load]);

  // 필터/정렬/페이지크기 변경 시 1페이지로 초기화
  useEffect(() => { setPage(1); }, [sort, posFil, countryFil, pageSize]);

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

  // 중복 제거: playerName 기준, firstId(첫 획득)·lastId(마지막 획득) 추적
  const deduped = Object.values(
    cards.reduce((acc, c) => {
      const key = c.playerName;
      if (!acc[key]) {
        acc[key] = { ...c, count: 1, firstId: c.id, lastId: c.id };
      } else {
        acc[key].count   += 1;
        acc[key].firstId  = Math.min(acc[key].firstId, c.id);
        acc[key].lastId   = Math.max(acc[key].lastId,  c.id);
      }
      return acc;
    }, {})
  );

  // 나라 목록(중복 제거·가나다순)
  const countries = [...new Set(deduped.map(c => c.nationality).filter(Boolean))].sort();

  // 필터 적용
  let filtered = deduped;
  if (posFil !== "전체") {
    filtered = filtered.filter(c => posGroup(c.position) === posFil);
  }
  if (countryFil) {
    filtered = filtered.filter(c => c.nationality === countryFil);
  }

  // 정렬
  filtered = [...filtered].sort((a, b) => {
    if (sort === "overall_desc") return b.overall - a.overall;
    if (sort === "overall_asc")  return a.overall - b.overall;
    if (sort === "date_desc")    return b.lastId  - a.lastId;  // 가장 최근 획득 기준
    if (sort === "date_asc")     return a.firstId - b.firstId; // 처음 획득 기준
    return 0;
  });

  // 페이지네이션
  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div>
      {/* 요약 */}
      <p className="sc-collection-count">
        총 {deduped.length}종 · {cards.length}장 보유
        {total < deduped.length && <span className="sc-filter-hint"> (필터 적용: {total}종)</span>}
      </p>

      {/* ── 필터 영역 ── */}
      <div className="sc-filters">
        {/* 정렬 */}
        <div className="sc-filter-row">
          <span className="sc-filter-label">정렬</span>
          <select
            className="sc-filter-select"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 포지션 */}
        <div className="sc-filter-row">
          <span className="sc-filter-label">포지션</span>
          <div className="sc-chips">
            {POS_GROUPS.map(p => (
              <button
                key={p} type="button"
                className={`sc-chip ${posFil === p ? "active" : ""}`}
                onClick={() => setPosFil(p)}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* 나라 */}
        <div className="sc-filter-row">
          <span className="sc-filter-label">나라</span>
          <select
            className="sc-filter-select"
            value={countryFil}
            onChange={e => setCountryFil(e.target.value)}
          >
            <option value="">전체</option>
            {countries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* 페이지당 개수 */}
        <div className="sc-filter-row">
          <span className="sc-filter-label">개수</span>
          <div className="sc-chips">
            {PAGE_SIZES.map(n => (
              <button
                key={n} type="button"
                className={`sc-chip ${pageSize === n ? "active" : ""}`}
                onClick={() => setPageSize(n)}
              >{n}개</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 카드 그리드 ── */}
      {paged.length === 0
        ? <p className="sc-empty">조건에 맞는 선수가 없습니다.</p>
        : (
          <div className="sc-grid sc-grid-compact sc-grid-col6">
            {paged.map((c, i) => (
              <SoccerCard key={c.id} card={c} index={i} compact count={c.count} />
            ))}
          </div>
        )
      }

      {/* ── 페이지네이션 ── */}
      {totalPages > 1 && (
        <div className="sc-pagination">
          <button
            type="button" className="sc-page-btn"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >‹ 이전</button>

          {/* 페이지 번호 버튼 (최대 5개) */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
            .reduce((acc, n, idx, arr) => {
              if (idx > 0 && n - arr[idx - 1] > 1) acc.push("…");
              acc.push(n);
              return acc;
            }, [])
            .map((n, i) =>
              n === "…"
                ? <span key={`ellipsis-${i}`} className="sc-page-ellipsis">…</span>
                : (
                  <button
                    key={n} type="button"
                    className={`sc-page-num ${safePage === n ? "active" : ""}`}
                    onClick={() => setPage(n)}
                  >{n}</button>
                )
            )
          }

          <button
            type="button" className="sc-page-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage(safePage + 1)}
          >다음 ›</button>
        </div>
      )}
    </div>
  );
}

// ── 메인 화면 ─────────────────────────────────────────────────────────────
export function PlayerCardScreen({ isLoggedIn, user, onDrawn, onBack }) {
  const [tab, setTab]     = useState("draw");    // "draw" | "collection"
  const [phase, setPhase] = useState("entry");   // "entry" | "drawing" | "reveal"
  const [result, setResult] = useState(null);
  const balance = user?.pointBalance ?? 0;        // 보유 포인트

  async function draw(count) {
    if (!isLoggedIn || phase === "drawing") return;
    if (balance < count * 100) return;            // 잔액 부족(서버도 거절)
    setPhase("drawing");
    try {
      const cards = await drawPlayerCard(count);
      setResult(Array.isArray(cards) ? cards : []);
      setPhase("reveal");
      onDrawn?.();                                 // 보유 포인트 갱신(me 재조회)
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
      {/* 헤더 */}
      <div className="sc-header">
        <button type="button" className="sc-back-btn" onClick={onBack}>← 돌아가기</button>
        <h1 className="sc-title">⚽ 선수 카드 뽑기</h1>
        <p className="sc-subtitle">전 세계 선수들을 수집하세요 · 테스트 버전</p>
      </div>

      {/* 탭 */}
      <div className="sc-tabs">
        <button
          type="button"
          className={`sc-tab ${tab === "draw" ? "active" : ""}`}
          onClick={() => { setTab("draw"); reset(); }}
        >뽑기</button>
        <button
          type="button"
          className={`sc-tab ${tab === "collection" ? "active" : ""}`}
          onClick={() => setTab("collection")}
        >내 컬렉션</button>
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
                  <p className="sc-pack-desc">레전드~아마추어 6등급</p>
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
                  <>
                    <p className="sc-balance">
                      보유 포인트 <b>{balance.toLocaleString()} P</b>
                      <span className="sc-balance-hint"> · 100P당 1회</span>
                    </p>
                    <div className="sc-draw-btns">
                      <button
                        type="button"
                        className="sc-btn sc-btn-primary sc-btn-lg"
                        onClick={() => draw(1)}
                        disabled={phase === "drawing" || balance < 100}
                      >
                        {phase === "drawing" ? "뽑는 중…" : "1회 뽑기 (100P)"}
                      </button>
                      <button
                        type="button"
                        className="sc-btn sc-btn-accent sc-btn-lg"
                        onClick={() => draw(10)}
                        disabled={phase === "drawing" || balance < 1000}
                      >
                        {phase === "drawing" ? "뽑는 중…" : "10회 뽑기 (1000P)"}
                      </button>
                    </div>
                    {balance < 100 && (
                      <p className="sc-empty">포인트가 부족합니다 — 예측 적중으로 포인트를 모으세요.</p>
                    )}
                  </>
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
