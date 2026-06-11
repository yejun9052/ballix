import { useState, useEffect } from "react";

const API = "http://localhost:8080";

// ── 공통 fetch ──
async function call(path, opts) {
  const res = await fetch(API + path, opts);
  const json = await res.json();
  console.log(`%c${opts?.method || "GET"} ${path} →`, "color:#16a34a", json);
  if (!json.success) throw new Error(json.msg || "실패");
  return json.data;
}

// ── 로그인 정보(/me) 공통 조회 ──
// 홈 접속 시 1회만 네트워크 호출하고 모든 패널이 결과를 공유한다.
// 로그인(OAuth 리다이렉트) 후엔 페이지가 새로 로드되므로 자동으로 다시 조회된다.
let meCache;            // undefined=미조회, null=비로그인, object=UserView
let mePromise = null;
function fetchMe() {
  if (!mePromise) {
    mePromise = fetch(API + "/api/user/me", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => { meCache = j && j.success ? j.data : null; return meCache; })
      .catch(() => { meCache = null; return null; });
  }
  return mePromise;
}
function useMe() {
  const [me, setMe] = useState(meCache);
  const [checked, setChecked] = useState(meCache !== undefined);
  useEffect(() => {
    let alive = true;
    fetchMe().then((m) => { if (alive) { setMe(m); setChecked(true); } });
    return () => { alive = false; };
  }, []);
  return { me, checked, isAdmin: me?.role === "ADMIN_USER" };
}

// 미리보기/뷰 필드명 흡수
const normLineup = (p) => ({
  name: p.name, shirt: p.shirtNumber ?? p.shirt,
  home: p.isHome ?? p.home, starter: p.isStarter ?? p.starter,
  rating: p.rating, subIn: p.subInMinute, subOut: p.subOutMinute,
  posX: p.posX, posY: p.posY, positionId: p.positionId,
  playerId: p.fotmobPlayerId ?? p.playerId,
});
const shortName = (n) => { const a = String(n || "").trim().split(" "); return a[a.length - 1]; };
const playerPhoto = (id) => id ? `https://images.fotmob.com/image_resources/playerimages/${id}.png` : null;
const normEvent = (e) => ({
  minute: e.minute, type: e.type, home: e.isHome ?? e.home,
  player: e.playerName, detail: e.detail,
});
const eventIcon = (e) => e.type === "CARD" ? (e.detail === "Red" ? "🟥" : "🟨") : ({ GOAL: "⚽", SUB: "🔄" }[e.type] || "•");
const ratingColor = (r) => r == null ? "#888" : r >= 7.5 ? "#1a9850" : r >= 7.0 ? "#66bd63" : r >= 6.5 ? "#fdae61" : "#d73027";
const kst = (iso) => iso ? iso.replace("T", " ").slice(0, 16) : "";

// 진행 시간 초 단위 시계: 백엔드가 준 시작앵커(liveStartedAt)에서 (지금 - 앵커)를 mm:ss로 흘림.
// 앵커가 실제 시각 기준이라 stale 없이 정확하고, 폴링 없이 매초 흐름(서버 부하 0).
const parseAnchorMs = (v) => {
  if (v == null) return null;
  // Jackson 배열 [yr,mo,d,h,min,s,ns] 형식 방어 (write-dates-as-timestamps=true 환경)
  if (Array.isArray(v)) {
    const [yr, mo, d, h, min, s] = v;
    const ms = new Date(yr, mo - 1, d, h, min, s).getTime();
    return isNaN(ms) ? null : ms;
  }
  // ISO 문자열: 나노초(9자리)가 포함돼 있으면 밀리초(3자리)로 잘라 파싱
  const ms = new Date(String(v).replace(/(\.\d{3})\d*/, "$1")).getTime();
  return isNaN(ms) ? null : ms;
};
const liveClock = (m, now) => {
  if (m.status !== "IN_PLAY") return null;
  const lt = String(m.liveTime || "");
  // 하프타임 등 숫자 없는 상태 라벨은 시계 멈추고 그대로 표시
  if (lt && !/\d/.test(lt)) return lt === "HT" ? "HT(하프타임)" : lt;
  const anchorMs = parseAnchorMs(m.liveStartedAt);
  if (anchorMs != null) {
    const sec = Math.max(0, Math.floor((now - anchorMs) / 1000));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    let label = `${mm}:${String(ss).padStart(2, "0")}`;
    const added = String(m.liveTime || "").match(/\+\s*(\d+)/); // FotMob "45+2'"에서 추가시간 추출
    if (added) label += ` +${added[1]}'`;
    return label;
  }
  return m.liveTime || null; // 앵커 없으면 분 표기 폴백
};

// 백엔드 Page<T> 응답에서 목록/메타 추출. 배열(비페이지 응답)이 와도 안전하게 흡수.
const asPage = (d) =>
  Array.isArray(d)
    ? { content: d, number: 0, totalPages: 1, totalElements: d.length }
    : (d && Array.isArray(d.content))
      ? d
      : { content: [], number: 0, totalPages: 0, totalElements: 0 };

const PAGE_SIZE = 8;

// 페이지 이동 버튼 (page는 0-based)
function Pager({ page, totalPages, totalElements, onPage }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
      <button style={S.btnGhost} disabled={page <= 0} onClick={() => onPage(page - 1)}>◀ 이전</button>
      <span style={S.desc}>{page + 1} / {totalPages}{totalElements != null ? ` · 총 ${totalElements}건` : ""}</span>
      <button style={S.btnGhost} disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>다음 ▶</button>
    </div>
  );
}

// 공개 공지 배너 — 최신 공지 몇 개를 상단에 노출(관리자가 "공지 때린" 내용)
function NoticeBanner() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    call("/api/notice?page=0&size=5").then((d) => setItems(asPage(d).content)).catch(() => {});
  }, []);
  if (items.length === 0) return null;
  return (
    <div style={S.noticeBanner}>
      {items.map((n) => (
        <div key={n.id} style={S.noticeItem}>
          📢 <b style={{ margin: "0 6px" }}>{n.title}</b>
          <span>{n.content}</span>
          <span style={S.noticeMeta}> · {n.authorName} · {kst(n.createAt)}</span>
        </div>
      ))}
    </div>
  );
}

export default function FotmobTester() {
  const [tab, setTab] = useState("schedule");
  const { me, checked } = useMe();   // 홈 접속 시 /me 1회 조회 (전 패널 공유)
  return (
    <div style={S.page}>
      <h1 style={S.h1}>⚽ FotMob 콘솔 <span style={S.sub}>모든 결과는 콘솔(F12)에도 출력</span>
        <span style={{ float: "right", fontSize: 13, fontWeight: 400 }}>
          {checked && (me
            ? <span style={{ color: "#86efac" }}>👤 {me.name}{me.role === "ADMIN_USER" ? " · 🛡 관리자" : ""}</span>
            : <span style={S.desc}>비로그인</span>)}
        </span>
      </h1>
      <div style={S.tabs}>
        {[["schedule", "📅 일정"], ["standings", "🏆 순위"], ["predict", "🎯 예측"], ["ai", "🤖 AI"], ["rank", "🏅 랭킹"], ["admin", "🛡 관리자"], ["tools", "🛠 도구"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>{label}</button>
        ))}
      </div>
      {tab === "schedule" && <SchedulePanel />}
      {tab === "standings" && <StandingsPanel />}
      {tab === "predict" && <PredictionPanel />}
      {tab === "ai" && <AiPanel />}
      {tab === "rank" && <RankPanel />}
      {tab === "admin" && <AdminPanel />}
      {tab === "tools" && <ToolsPanel />}
    </div>
  );
}

// ── 일정 탭: 날짜별 경기 → 클릭하면 라인업/이벤트 ──
function SchedulePanel() {
  const [date, setDate] = useState("2026-06-13");
  const [matches, setMatches] = useState([]);
  const [pageInfo, setPageInfo] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => Date.now());       // 1초 틱(지연 초기화)
  const hasLive = matches.some((m) => m.status === "IN_PLAY");

  // 화면 시계 1초 틱 (서버 호출 없음)
  useEffect(() => {
    if (!hasLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasLive]);

  // 앵커 재동기화: 60초마다 조용히 다시 불러와 최신 liveStartedAt 반영
  // (백엔드가 3분 폴링마다 앵커 갱신 → 프론트가 흡수해서 FotMob 시계와의 누적오차 보정)
  useEffect(() => {
    if (!hasLive || !date) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/match/MatchDay?date=${date}&page=${pageInfo.number}&size=${PAGE_SIZE}`);
        const j = await res.json();
        if (j.success) { const p = asPage(j.data); setMatches(p.content); setNow(Date.now()); }
      } catch { /* 조용히 무시 */ }
    }, 60000);
    return () => clearInterval(t);
  }, [hasLive, date, pageInfo.number]);

  async function load(p = 0) {
    setLoading(true); setErr(""); setDetail(null);
    try {
      const data = await call(`/api/match/MatchDay?date=${date}&page=${p}&size=${PAGE_SIZE}`);
      const pg = asPage(data);
      setMatches(pg.content);
      setPageInfo({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
      setNow(Date.now());
    } catch (e) { setErr(e.message); setMatches([]); setPageInfo({ number: 0, totalPages: 0, totalElements: 0 }); }
    finally { setLoading(false); }
  }

  async function openMatch(m) {
    setErr("");
    try {
      // 백엔드가 조회 시 필요하면 라인업을 1회 자동 동기화(DB-first). 프론트는 GET만.
      const view = await call(`/api/match/${m.id}/fotmob`);
      const lineups = (view.lineup || []).map(normLineup);
      const events = (view.events || []).map(normEvent);
      console.group(`%c[경기] ${m.homeTeam?.name} vs ${m.awayTeam?.name}`, "color:#2563eb;font-weight:bold");
      if (lineups.length) console.table(lineups);
      if (events.length) console.table(events);
      console.groupEnd();
      setDetail({ match: m, lineups, events, homeFormation: view.homeFormation, awayFormation: view.awayFormation });
    } catch (e) { setErr("조회 실패: " + e.message); }
  }

  return (
    <div>
      <NoticeBanner />
      <div style={S.panel}>
        <div style={S.row}>
          <input type="date" style={S.input} value={date} onChange={(e) => setDate(e.target.value)} />
          <button style={S.btn} onClick={() => load(0)} disabled={loading}>{loading ? "불러오는 중..." : "일정 불러오기"}</button>
          <span style={S.desc}>FotMob 일정은 백그라운드로 자동 저장됩니다. (월드컵 6/13~)</span>
        </div>
        {err && <div style={S.error}>⚠️ {err}</div>}
        {matches.length > 0 && (
          <div style={S.matchList}>
            {matches.map((m) => (
              <div key={m.id} style={S.matchRow} onClick={() => openMatch(m)}>
                <span style={S.comp}>{m.competition?.name}{m.groupName ? ` · ${m.groupName}` : ""}</span>
                <div style={S.teams}>
                  <Team t={m.homeTeam} align="right" />
                  <b style={S.vs}>{m.homeScore ?? "-"} : {m.awayScore ?? "-"}</b>
                  <Team t={m.awayTeam} align="left" />
                </div>
                <span style={S.time}>{kst(m.matchTime)} · {m.status}{liveClock(m, now) ? ` · ⏱ ${liveClock(m, now)}` : ""}</span>
              </div>
            ))}
          </div>
        )}
        <Pager page={pageInfo.number} totalPages={pageInfo.totalPages} totalElements={pageInfo.totalElements} onPage={load} />
      </div>
      {detail && <MatchDetail detail={detail} />}
    </div>
  );
}

function Team({ t, align }) {
  if (!t) return <span style={{ flex: 1 }} />;
  return (
    <span style={{ ...S.team, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      {align === "left" && t.crest && <img src={t.crest} width="20" height="20" alt="" />}
      <span>{t.name}</span>
      {align === "right" && t.crest && <img src={t.crest} width="20" height="20" alt="" />}
    </span>
  );
}

function MatchDetail({ detail }) {
  const { match, lineups, events, homeFormation, awayFormation } = detail;
  const home = lineups.filter((p) => p.home);
  const away = lineups.filter((p) => !p.home);
  const hasCoords = lineups.some((p) => p.starter && p.posX != null && p.posY != null);
  return (
    <div style={S.panel}>
      <h3 style={S.h3}>{match.homeTeam?.name} vs {match.awayTeam?.name}</h3>
      {match.venue && <div style={{ ...S.desc, marginBottom: 10 }}>🏟 {match.venue}</div>}
      {events.length > 0 && (
        <div style={S.timeline}>
          {events.filter((e) => e.type !== "Half").map((e, i) => (
            <div key={i} style={S.event}>
              <span style={S.min}>{e.minute}'</span> {eventIcon(e)} <b>{e.player}</b>
              {e.detail && <span style={S.detail}> {e.detail}</span>}
              <span style={S.side}>{e.home ? "홈" : "원정"}</span>
            </div>
          ))}
        </div>
      )}
      {lineups.length > 0 ? (
        <>
          {hasCoords && (
            <div style={S.lineupWrap}>
              <Pitch title={match.homeTeam?.name} formation={homeFormation} players={home} isHome={true} />
              <Pitch title={match.awayTeam?.name} formation={awayFormation} players={away} isHome={false} />
            </div>
          )}
          <div style={S.lineupWrap}>
            <LineupCol title={match.homeTeam?.name} formation={homeFormation} players={home} />
            <LineupCol title={match.awayTeam?.name} formation={awayFormation} players={away} />
          </div>
        </>
      ) : <p style={S.desc}>라인업이 아직 없습니다 (경기 1시간 전부터 공개).</p>}
    </div>
  );
}

// 포메이션 배치도: 선발을 피치 좌표(posX=깊이,posY=좌우)에 배치. GK 아래, 공격 위.
// FotMob 좌표계는 홈팀 관점 절대좌표 → 어웨이팀은 posY를 미러(1-y)해야 좌우가 맞음.
function Pitch({ title, formation, players, isHome }) {
  const starters = players.filter((p) => p.starter && p.posX != null && p.posY != null);
  return (
    <div style={S.col}>
      <h4 style={S.colTitle}>{title} {formation && <span style={S.tag}>{formation}</span>}</h4>
      <div style={S.pitch}>
        {starters.map((p, i) => {
          const posY = isHome ? (p.posY ?? 0.5) : 1 - (p.posY ?? 0.5);
          return (
          <div key={i} style={{ ...S.pitchPlayer, bottom: `${(p.posX ?? 0) * 86 + 5}%`, left: `${posY * 80 + 10}%` }}>
            <div style={{ ...S.pitchDot, border: `2px solid ${ratingColor(p.rating)}` }}>
              <span>{p.shirt ?? ""}</span>
              {p.playerId && (
                <img src={playerPhoto(p.playerId)} style={S.pitchImg} alt=""
                     onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
            </div>
            <div style={S.pitchName}>{shortName(p.name)}{p.rating != null ? ` ${p.rating.toFixed(1)}` : ""}</div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function LineupCol({ title, formation, players }) {
  const starters = players.filter((p) => p.starter);
  const subs = players.filter((p) => !p.starter);
  return (
    <div style={S.col}>
      <h4 style={S.colTitle}>{title} {formation && <span style={S.tag}>{formation}</span>}</h4>
      <Rows label="선발" players={starters} />
      <Rows label="후보" players={subs} />
    </div>
  );
}
function Rows({ label, players }) {
  if (!players.length) return null;
  return (<>
    <div style={S.subhead}>{label}</div>
    {players.map((p, i) => (
      <div key={i} style={S.player}>
        <span style={S.shirt}>{p.shirt ?? "-"}</span>
        {p.playerId
          ? <img src={playerPhoto(p.playerId)} style={S.avatar} alt=""
                 onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          : <span style={S.avatar} />}
        <span style={S.pname}>{p.name}</span>
        {p.subOut != null && <span style={S.subInfo}>↓{p.subOut}'</span>}
        <span style={{ ...S.rating, background: ratingColor(p.rating) }}>{p.rating != null ? p.rating.toFixed(1) : "-"}</span>
      </div>
    ))}
  </>);
}

// ── 순위 탭 ──
function StandingsPanel() {
  const [compId, setCompId] = useState("7");
  const [groups, setGroups] = useState([]);
  const [pageInfo, setPageInfo] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(sync, p = 0) {
    setLoading(true); setErr("");
    try {
      const path = `/api/fotmob/standings/${compId}` + (sync ? "/sync" : "") + `?page=${p}&size=${PAGE_SIZE}`;
      // 갱신(/sync)은 H1로 관리자 잠금 → 쿠키 동봉
      const data = await call(path, sync ? { method: "POST", credentials: "include" } : undefined);
      const pg = asPage(data);
      // 조별 그룹핑 (페이지 단위라 같은 조가 여러 페이지에 걸칠 수 있음)
      const byGroup = {};
      pg.content.forEach((r) => {
        const g = r.groupName || "전체";
        (byGroup[g] = byGroup[g] || []).push(r);
      });
      setGroups(Object.entries(byGroup));
      setPageInfo({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
    } catch (e) { setErr(e.message); setGroups([]); setPageInfo({ number: 0, totalPages: 0, totalElements: 0 }); }
    finally { setLoading(false); }
  }

  return (
    <div style={S.panel}>
      <div style={S.row}>
        <input style={{ ...S.input, width: 90 }} value={compId} onChange={(e) => setCompId(e.target.value)} placeholder="compId" />
        <button style={S.btn} onClick={() => load(false)} disabled={loading}>순위 조회</button>
        <button style={S.btnGhost} onClick={() => load(true)} disabled={loading}>FotMob에서 갱신</button>
        <span style={S.desc}>월드컵 compId=7 (경기 종료 시 자동 갱신)</span>
      </div>
      {err && <div style={S.error}>⚠️ {err}</div>}
      {groups.map(([g, rows]) => (
        <div key={g} style={{ marginTop: 14 }}>
          <h4 style={S.h4}>{g}</h4>
          <table style={S.table}>
            <thead><tr><th style={S.th}>#</th><th style={S.thL}>팀</th><th style={S.th}>경기</th><th style={S.th}>승</th><th style={S.th}>무</th><th style={S.th}>패</th><th style={S.th}>득실</th><th style={S.th}>승점</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={S.td}>{r.rankNo}</td>
                  <td style={S.tdL}>{r.crest && <img src={r.crest} width="18" height="18" alt="" style={{ verticalAlign: "middle", marginRight: 6 }} />}{r.teamName}</td>
                  <td style={S.td}>{r.played}</td><td style={S.td}>{r.wins}</td><td style={S.td}>{r.draws}</td><td style={S.td}>{r.losses}</td>
                  <td style={S.td}>{r.goalDiff}</td><td style={{ ...S.td, fontWeight: 700 }}>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <Pager page={pageInfo.number} totalPages={pageInfo.totalPages} totalElements={pageInfo.totalElements} onPage={(p) => load(false, p)} />
    </div>
  );
}

// ── 예측 탭: 로그인 → WC 경기 불러오기 → 클릭 예측 → 내 예측 조회 ──
const WINNER_LABEL = { HOME_TEAM: "홈 승", DRAW: "무", AWAY_TEAM: "원정 승" };

// 예측 분포 막대 한 줄
function RatioRow({ label, pct, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0", fontSize: 13 }}>
      <span style={{ width: 100, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, background: "#334155", borderRadius: 6, height: 18 }}>
        <div style={{ width: `${pct}%`, background: "#2563eb", height: "100%", borderRadius: 6, minWidth: pct > 0 ? 2 : 0 }} />
      </div>
      <span style={{ width: 78 }}>{pct}% ({count})</span>
    </div>
  );
}

function PredictionPanel() {
  const cred = { credentials: "include" }; // JWT 쿠키 동봉

  const [compId, setCompId] = useState("6"); // WC 내부 competitionId
  const [matches, setMatches] = useState([]);
  const [upPage, setUpPage] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [matchId, setMatchId] = useState("");
  const [winner, setWinner] = useState("HOME_TEAM");
  const [mine, setMine] = useState([]);
  const [minePage, setMinePage] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [ratio, setRatio] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function login() { window.location.href = API + "/oauth2/authorization/google"; }
  async function logout() {
    setErr(""); setMine([]);
    try { await call("/api/auth/logout", { method: "POST", ...cred }); setMsg("로그아웃됨"); }
    catch (e) { setErr(e.message); }
  }

  // 다가오는 WC 경기 (예측 대상) — /upcoming 이 이미 킥오프 가까운 순으로 줌
  async function loadMatches(p = 0) {
    setErr(""); setMsg("");
    try {
      const data = await call(`/api/match/upcoming?compId=${compId}&page=${p}&size=${PAGE_SIZE}`);
      const pg = asPage(data);
      setMatches(pg.content);
      setUpPage({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
      setMsg(`다가오는 ${pg.totalElements}경기 중 ${pg.content.length}개 표시`);
    } catch (e) { setErr(e.message); setMatches([]); setUpPage({ number: 0, totalPages: 0, totalElements: 0 }); }
  }

  // 예측하기 / 재예측
  async function doPredict() {
    setErr(""); setMsg("");
    if (!matchId) { setErr("matchId를 선택하거나 입력하세요."); return; }
    try {
      const d = await call(`/api/prediction/predict?matchId=${matchId}&predictedWinner=${winner}`, { method: "POST", ...cred });
      setMsg(`✅ 예측 저장: matchId=${matchId} → ${d.predictedWinner} (${WINNER_LABEL[d.predictedWinner] || ""})`);
      loadRatio(); // 예측 후에만 비율 공개
    } catch (e) { setErr("예측 실패: " + e.message); }
  }

  // 예측 분포(%) — 예측한 뒤에만 서버가 내려줌
  async function loadRatio() {
    if (!matchId) return;
    try { setRatio(await call(`/api/prediction/ratio?matchId=${matchId}`, cred)); }
    catch { setRatio(null); }
  }

  // 내 예측 전부
  async function loadMine(p = 0) {
    setErr(""); setMsg("");
    try {
      const d = await call(`/api/prediction/myPrediction?page=${p}&size=${PAGE_SIZE}`, cred);
      const pg = asPage(d);
      setMine(pg.content);
      setMinePage({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
      setMsg(`내 예측 ${pg.totalElements}건`);
    } catch (e) { setErr(e.message); setMine([]); setMinePage({ number: 0, totalPages: 0, totalElements: 0 }); }
  }

  const fmtCorrect = (v) => v == null ? "⏳ 대기" : v ? "🟢 적중" : "🔴 실패";
  // enum → 팀 이름 라벨 (경기 정보 있으면 팀명, 없으면 홈/원정)
  const pickLabel = (p) => {
    if (p.predictedWinner === "HOME_TEAM") return p.homeTeamName || "홈 승";
    if (p.predictedWinner === "AWAY_TEAM") return p.awayTeamName || "원정 승";
    return "무";
  };
  // 선택된 경기의 팀 이름 (화면 표시용 — 전송 값은 enum 그대로)
  const selMatch = matches.find((m) => String(m.id) === String(matchId));
  const homeName = selMatch?.homeTeam?.name;
  const awayName = selMatch?.awayTeam?.name;

  return (
    <div>
      <div style={S.panel}>
        <h3 style={S.h3}>로그인 <span style={S.tag}>예측은 로그인 필요(쿠키)</span></h3>
        <div style={S.row}>
          <button style={S.btn} onClick={login}>Google 로그인</button>
          <button style={S.btnGhost} onClick={logout}>로그아웃</button>
          <span style={S.desc}>로그인 후 이 탭으로 돌아오세요.</span>
        </div>
      </div>

      <div style={S.panel}>
        <h3 style={S.h3}>예측할 WC 경기 <span style={S.tag}>월드컵만 가능</span></h3>
        <div style={S.row}>
          <input style={{ ...S.input, width: 90 }} value={compId} onChange={(e) => setCompId(e.target.value)} placeholder="compId" />
          <button style={S.btn} onClick={() => loadMatches(0)}>다가오는 경기 불러오기</button>
          <span style={S.desc}>GET /api/match/upcoming?compId=6 · 미래 경기만 · 클릭하면 예측 폼에 자동 입력</span>
        </div>
        {matches.length > 0 && (
          <div style={S.matchList}>
            {matches.map((m) => (
              <div key={m.id}
                   style={{ ...S.matchRow, outline: String(m.id) === String(matchId) ? "2px solid #2563eb" : "none" }}
                   onClick={() => setMatchId(String(m.id))}>
                <span style={S.comp}>#{m.id}{m.groupName ? ` · ${m.groupName}` : ""}</span>
                <div style={S.teams}>
                  <Team t={m.homeTeam} align="right" />
                  <b style={S.vs}>{m.homeScore ?? "-"} : {m.awayScore ?? "-"}</b>
                  <Team t={m.awayTeam} align="left" />
                </div>
                <span style={S.time}>{kst(m.matchTime)} · {m.status}</span>
              </div>
            ))}
          </div>
        )}
        <Pager page={upPage.number} totalPages={upPage.totalPages} totalElements={upPage.totalElements} onPage={loadMatches} />
      </div>

      <div style={S.panel}>
        <h3 style={S.h3}>예측하기</h3>
        {selMatch && <div style={S.desc}>선택: <b>{homeName}</b> vs <b>{awayName}</b> ({kst(selMatch.matchTime)})</div>}
        <div style={{ ...S.row, marginTop: 6 }}>
          <input style={{ ...S.input, width: 110 }} value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="matchId" />
          <select style={S.input} value={winner} onChange={(e) => setWinner(e.target.value)}>
            <option value="HOME_TEAM">{homeName ? `${homeName} 승` : "홈 승"}</option>
            <option value="DRAW">무</option>
            <option value="AWAY_TEAM">{awayName ? `${awayName} 승` : "원정 승"}</option>
          </select>
          <button style={S.btn} onClick={doPredict}>예측 / 재예측</button>
          <button style={S.btnGhost} onClick={() => loadMine(0)}>내 예측 조회</button>
        </div>
        {err && <div style={S.error}>⚠️ {err}</div>}
        {msg && <div style={S.info}>{msg}</div>}
        {ratio && (
          <div style={{ marginTop: 12 }}>
            <div style={S.subhead}>예측 분포 (총 {ratio.total}명)</div>
            <RatioRow label={homeName || "홈 승"} pct={ratio.homePercent} count={ratio.homeCount} />
            <RatioRow label="무" pct={ratio.drawPercent} count={ratio.drawCount} />
            <RatioRow label={awayName || "원정 승"} pct={ratio.awayPercent} count={ratio.awayCount} />
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <div style={S.panel}>
          <h3 style={S.h3}>내 예측 ({minePage.totalElements})</h3>
          <table style={S.table}>
            <thead><tr><th style={S.th}>matchId</th><th style={S.thL}>예측</th><th style={S.th}>채점</th></tr></thead>
            <tbody>
              {mine.map((p) => (
                <tr key={p.id}>
                  <td style={S.td}>{p.matchId ?? "-"}</td>
                  <td style={S.tdL}>{pickLabel(p)} <span style={S.desc}>({p.predictedWinner})</span></td>
                  <td style={S.td}>{fmtCorrect(p.isCorrect)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={minePage.number} totalPages={minePage.totalPages} totalElements={minePage.totalElements} onPage={loadMine} />
        </div>
      )}
    </div>
  );
}

// ── 랭킹 탭: 내 전적 + 리더보드 ──
function RankPanel() {
  const cred = { credentials: "include" };
  const { me: cachedMe } = useMe();         // 홈 접속 시 조회된 /me 공유
  const [me, setMe] = useState(null);
  const [board, setBoard] = useState([]);
  const [boardPage, setBoardPage] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [err, setErr] = useState("");
  const shownMe = me || cachedMe;           // 새로고침 전엔 캐시 값 표시

  useEffect(() => { loadBoard(0); }, []);

  async function loadMe() {
    setErr("");
    try { setMe(await call("/api/user/me", cred)); }
    catch (e) { setErr(e.message); setMe(null); }
  }
  async function loadBoard(p = 0) {
    setErr("");
    try {
      const pg = asPage(await call(`/api/user/leaderboard?page=${p}&size=${PAGE_SIZE}`));
      setBoard(pg.content);
      setBoardPage({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      <div style={S.panel}>
        <h3 style={S.h3}>내 정보 <span style={S.tag}>로그인 필요</span></h3>
        <div style={S.row}>
          <button style={S.btn} onClick={loadMe}>내 전적 새로고침</button>
          {shownMe && <span style={S.desc}><b style={{ color: "#e2e8f0" }}>{shownMe.name}</b> · 참여 {shownMe.matchesPlayed} · 적중 {shownMe.correctCount} · 적중률 <b style={{ color: "#e2e8f0" }}>{shownMe.accuracy}%</b></span>}
        </div>
      </div>
      <div style={S.panel}>
        <h3 style={S.h3}>리더보드 <span style={S.tag}>적중순</span></h3>
        <button style={S.btnGhost} onClick={() => loadBoard(0)}>새로고침</button>
        {err && <div style={S.error}>⚠️ {err}</div>}
        {board.length > 0 ? (
          <table style={{ ...S.table, marginTop: 10 }}>
            <thead><tr><th style={S.th}>#</th><th style={S.thL}>이름</th><th style={S.th}>경기</th><th style={S.th}>적중</th><th style={S.th}>적중률</th></tr></thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.rank}>
                  <td style={S.td}>{r.rank}</td>
                  <td style={S.tdL}>{r.name}</td>
                  <td style={S.td}>{r.matchesPlayed}</td>
                  <td style={S.td}>{r.correctCount}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{r.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={S.desc}>아직 데이터가 없습니다. (예측이 채점되면 집계됩니다)</p>}
        <Pager page={boardPage.number} totalPages={boardPage.totalPages} totalElements={boardPage.totalElements} onPage={loadBoard} />
      </div>
    </div>
  );
}

// ── 도구 탭: 미리보기 / 일정 동기화 / 폴링 주기 ──
function ToolsPanel() {
  const [fid, setFid] = useState("5451162");
  const [interval, setIntervalV] = useState(null);
  const [pastDays, setPastDays] = useState("10");
  const [futureDays, setFutureDays] = useState("10");
  const [msg, setMsg] = useState("");

  useEffect(() => { call("/api/fotmob/poll-interval").then(setIntervalV).catch(() => {}); }, []);

  async function preview() {
    setMsg("미리보기 불러오는 중...");
    try {
      const d = await call(`/api/fotmob/preview/${fid}`, { credentials: "include" });
      console.group("%c[미리보기]", "color:#2563eb;font-weight:bold");
      console.table((d.lineups || []).map(normLineup));
      console.table((d.events || []).map(normEvent));
      console.groupEnd();
      setMsg(`${d.homeTeamName} ${d.homeScore}-${d.awayScore} ${d.awayTeamName} · 라인업 ${d.lineups?.length || 0} / 이벤트 ${d.events?.length || 0} (콘솔 확인)`);
    } catch (e) { setMsg("실패: " + e.message); }
  }
  async function syncSchedule() {
    setMsg(`일정 동기화 중... 과거 ${pastDays}일 ~ 미래 ${futureDays}일 (수십초 걸릴 수 있음)`);
    try { const n = await call(`/api/fotmob/schedule/sync?pastDays=${pastDays}&futureDays=${futureDays}`, { method: "POST", credentials: "include" }); setMsg(`일정 ${n}경기 동기화 완료`); }
    catch (e) { setMsg("실패: " + e.message); }
  }
  async function setPoll(minutes) {
    try { const v = await call(`/api/fotmob/poll-interval?minutes=${minutes}`, { method: "POST", credentials: "include" }); setIntervalV(v); setMsg(`폴링 주기 ${v}분으로 변경`); }
    catch (e) { setMsg("실패: " + e.message); }
  }

  return (
    <div>
      <div style={S.panel}>
        <h3 style={S.h3}>끝난 경기 미리보기 <span style={S.tag}>DB 미저장</span></h3>
        <div style={S.row}>
          <input style={S.input} value={fid} onChange={(e) => setFid(e.target.value)} placeholder="fotmobMatchId" />
          <button style={S.btn} onClick={preview}>미리보기</button>
        </div>
      </div>
      <div style={S.panel}>
        <h3 style={S.h3}>일정 동기화 <span style={S.tag}>불러올 일수 지정</span></h3>
        <div style={S.row}>
          <label style={S.desc}>과거</label>
          <input style={{ ...S.input, width: 60 }} type="number" value={pastDays} onChange={(e) => setPastDays(e.target.value)} />
          <label style={S.desc}>~ 미래</label>
          <input style={{ ...S.input, width: 60 }} type="number" value={futureDays} onChange={(e) => setFutureDays(e.target.value)} />
          <label style={S.desc}>일치</label>
          <button style={S.btn} onClick={syncSchedule}>지금 일정 동기화</button>
        </div>
      </div>
      <div style={S.panel}>
        <h3 style={S.h3}>폴링 주기 (관리자)</h3>
        <div style={S.row}>
          <span>현재: <b>{interval ?? "?"}분</b>마다 갱신</span>
          {[1, 3, 5, 10].map((n) => <button key={n} style={S.btnGhost} onClick={() => setPoll(n)}>{n}분</button>)}
        </div>
      </div>
      {msg && <div style={S.info}>{msg}</div>}
    </div>
  );
}

// ── AI 탭: 관리자 승률 예측(Gemini) + 골 요약 ──
function WinBar({ home, draw, away, homeName, awayName }) {
  const seg = (w, bg) => ({ width: `${w}%`, background: bg, display: "flex", alignItems: "center", justifyContent: "center" });
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", fontSize: 11, color: "#fff", fontWeight: 700 }}>
        <div style={seg(home, "#2563eb")}>{home >= 10 ? `${home}%` : ""}</div>
        <div style={seg(draw, "#94a3b8")}>{draw >= 10 ? `${draw}%` : ""}</div>
        <div style={seg(away, "#dc2626")}>{away >= 10 ? `${away}%` : ""}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
        <span>🔵 {homeName} {home}%</span>
        <span>⚪ 무 {draw}%</span>
        <span>🔴 {awayName} {away}%</span>
      </div>
    </div>
  );
}

function AiPanel() {
  const cred = { credentials: "include" }; // 관리자 JWT 쿠키 동봉
  const [matches, setMatches] = useState([]);
  const [pageInfo, setPageInfo] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [date, setDate] = useState(""); // 비우면 전체, 채우면 그 날짜만
  const [filter, setFilter] = useState("SCHEDULED"); // SCHEDULED | FINISHED | ALL
  const [summaries, setSummaries] = useState({}); // matchId -> 요약 텍스트
  const [busy, setBusy] = useState(null); // 처리 중 matchId
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const { isAdmin } = useMe(); // 예측 생성 UI는 관리자에게만 (공통 /me 캐시 사용)

  function login() { window.location.href = API + "/oauth2/authorization/google"; }

  // 필터 바뀌면 자동 재로드 (예정↔종료 전환 시 즉시 반영). date 변경은 버튼으로.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(0); }, [filter]);

  async function load(p = 0) {
    setErr(""); setMsg("");
    try {
      // allMatch는 matchTime 오름차순(과거가 위)이라 첫 페이지가 종료 경기로 차서 "예정"이 안 보인다.
      // 예정(예측용)은 미래 경기만 주는 upcoming을, 종료/전체는 allMatch를 쓴다. 날짜 지정 시엔 그 날짜만.
      let path;
      if (date) {
        path = `/api/match/MatchDay?date=${date}&page=${p}&size=${PAGE_SIZE}`;
      } else if (filter === "SCHEDULED") {
        path = `/api/match/upcoming?page=${p}&size=${PAGE_SIZE}`;
      } else {
        path = `/api/match/allMatch?page=${p}&size=${PAGE_SIZE}`;
      }
      const pg = asPage(await call(path));
      setMatches(pg.content);
      setPageInfo({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
      setMsg(date
        ? `${date} ${pg.totalElements}경기`
        : filter === "SCHEDULED"
          ? `다가오는 ${pg.totalElements}경기 (예측 대상)`
          : `전체 ${pg.totalElements}경기 — 예측 선택된 경기가 최상단`);
    } catch (e) {
      // MatchDay는 경기 없으면 에러를 던지므로 부드럽게 처리
      setMatches([]); setPageInfo({ number: 0, totalPages: 0, totalElements: 0 });
      setErr(date ? `${date}에 경기가 없습니다.` : e.message);
    }
  }

  // 관리자: 승률 예측(선택 + 생성). 성공 시 그 경기를 최상단으로 끌어올림.
  async function predict(m, force) {
    setBusy(m.id); setErr(""); setMsg("");
    try {
      const d = await call(`/api/admin/ai/predict?matchId=${m.id}&force=${!!force}`, { method: "POST", ...cred });
      setMatches((prev) => [d, ...prev.filter((x) => x.id !== m.id)]);
      setMsg(`✅ ${d.homeTeam?.name} ${d.aiHomePct}% / 무 ${d.aiDrawPct}% / ${d.awayTeam?.name} ${d.aiAwayPct}%`);
    } catch (e) { setErr("예측 실패: " + e.message); }
    finally { setBusy(null); }
  }

  // 골 요약(종료 경기). DB에 있으면 가져오고 없으면 1회 생성·저장(공개 재생성은 제거됨 — H2).
  async function summary(m) {
    setBusy(m.id); setErr(""); setMsg("");
    try {
      const d = await call(`/api/match/${m.id}/ai/summary`);
      setSummaries((prev) => ({ ...prev, [m.id]: d.summary }));
      setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, aiSummary: d.summary } : x)));
    } catch (e) { setErr("요약 실패: " + e.message); }
    finally { setBusy(null); }
  }

  const shown = matches.filter((m) => filter === "ALL" || m.status === filter);

  return (
    <div>
      <div style={S.panel}>
        <h3 style={S.h3}>
          AI 승률 예측 / 골 요약 <span style={S.tag}>예측=관리자 / 요약=공개</span>
          <span style={{ ...S.tag, background: isAdmin ? "#14532d" : "#334155", color: isAdmin ? "#86efac" : "#94a3b8" }}>
            {isAdmin ? "🟢 관리자 모드" : "👁 조회 모드"}
          </span>
        </h3>
        <div style={S.row}>
          <input type="date" style={S.input} value={date} onChange={(e) => setDate(e.target.value)} />
          {date && <button style={S.btnGhost} onClick={() => setDate("")}>날짜 해제</button>}
          <button style={S.btn} onClick={() => load(0)}>경기 불러오기</button>
          <select style={S.input} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="SCHEDULED">예정(예측용)</option>
            <option value="FINISHED">종료(요약용)</option>
            <option value="ALL">전체</option>
          </select>
          {!isAdmin && <button style={S.btnGhost} onClick={login}>Google 로그인</button>}
          <span style={S.desc}>
            {isAdmin
              ? "관리자: 예정 경기에서 승률 예측을 생성하세요. 예측한 경기는 최상단으로."
              : "승률 예측 생성은 관리자만 가능합니다. 일반 유저는 결과 조회만."}
          </span>
        </div>
        {err && <div style={S.error}>⚠️ {err}</div>}
        {msg && <div style={S.info}>{msg}</div>}
      </div>

      {shown.length > 0 && (
        <div style={S.panel}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shown.map((m) => {
              const finished = m.status === "FINISHED";
              const hasPred = m.aiHomePct != null;
              const working = busy === m.id;
              return (
                <div key={m.id} style={{ ...S.aiCard, outline: m.predictionEnabled ? "2px solid #2563eb" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={S.comp}>#{m.id} · {m.competition?.name}{m.groupName ? ` · ${m.groupName}` : ""}</span>
                    <span style={S.time}>{kst(m.matchTime)} · {m.status}</span>
                  </div>
                  <div style={{ ...S.teams, margin: "6px 0" }}>
                    <Team t={m.homeTeam} align="right" />
                    <b style={S.vs}>{finished ? `${m.homeScore ?? "-"} : ${m.awayScore ?? "-"}` : "vs"}</b>
                    <Team t={m.awayTeam} align="left" />
                  </div>

                  {hasPred && (
                    <WinBar home={m.aiHomePct} draw={m.aiDrawPct} away={m.aiAwayPct}
                            homeName={m.homeTeam?.name} awayName={m.awayTeam?.name} />
                  )}

                  <div style={{ ...S.row, marginTop: 8 }}>
                    {!finished && isAdmin && (
                      <button style={S.btn} disabled={working}
                              onClick={() => predict(m, hasPred)}>
                        {working ? "생성 중..." : hasPred ? "🔁 재예측" : "🤖 승률 예측"}
                      </button>
                    )}
                    {!finished && !isAdmin && !hasPred && (
                      <span style={S.desc}>🔒 승률 예측은 관리자만 생성할 수 있습니다</span>
                    )}
                    {finished && (
                      <button style={S.btn} disabled={working} onClick={() => summary(m)}>
                        {working ? "생성 중..." : (m.aiSummary || summaries[m.id]) ? "📝 요약 보기" : "📝 골 요약"}
                      </button>
                    )}
                  </div>

                  {(summaries[m.id] || m.aiSummary) && (
                    <div style={S.summaryBox}>📝 {summaries[m.id] || m.aiSummary}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Pager page={pageInfo.number} totalPages={pageInfo.totalPages} totalElements={pageInfo.totalElements} onPage={load} />
    </div>
  );
}

// ── 관리자 탭: 공지 작성/삭제 + 유저 권한/계정상태 관리 ──
function AdminPanel() {
  const cred = { credentials: "include" };
  const { isAdmin, checked: meChecked } = useMe(); // 공통 /me 캐시 사용
  // 공지
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [notices, setNotices] = useState([]);
  const [nPage, setNPage] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  // 유저
  const [users, setUsers] = useState([]);
  const [uPage, setUPage] = useState({ number: 0, totalPages: 0, totalElements: 0 });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // 경기 즉시 동기화
  const [syncMatchId, setSyncMatchId] = useState("");
  const [syncDate, setSyncDate] = useState("");
  const [syncMatches, setSyncMatches] = useState([]);
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => { loadNotices(0); }, []);

  function login() { window.location.href = API + "/oauth2/authorization/google"; }

  async function loadNotices(p = 0) {
    try {
      const pg = asPage(await call(`/api/notice?page=${p}&size=${PAGE_SIZE}`));
      setNotices(pg.content);
      setNPage({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
    } catch (e) { setErr(e.message); }
  }
  async function createNotice() {
    setErr(""); setMsg("");
    if (!title.trim() || !content.trim()) { setErr("제목과 내용을 입력하세요."); return; }
    try {
      await call("/api/admin/notice", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      setTitle(""); setContent(""); setMsg("✅ 공지 등록됨"); loadNotices(0);
    } catch (e) { setErr("등록 실패: " + e.message); }
  }
  async function deleteNotice(id) {
    setErr(""); setMsg("");
    try { await call(`/api/admin/notice/${id}`, { method: "DELETE", credentials: "include" }); setMsg("🗑 삭제됨"); loadNotices(nPage.number); }
    catch (e) { setErr("삭제 실패: " + e.message); }
  }

  async function loadUsers(p = 0) {
    setErr("");
    try {
      const pg = asPage(await call(`/api/admin/users?page=${p}&size=${PAGE_SIZE}`, cred));
      setUsers(pg.content);
      setUPage({ number: pg.number, totalPages: pg.totalPages, totalElements: pg.totalElements });
    } catch (e) { setErr("유저 목록 실패(관리자 권한 필요): " + e.message); setUsers([]); }
  }
  async function setRole(u, role) {
    setErr(""); setMsg("");
    try { await call(`/api/admin/users/${u.id}/role?role=${role}`, { method: "PUT", credentials: "include" }); setMsg(`${u.name} 권한 → ${role}`); loadUsers(uPage.number); }
    catch (e) { setErr("권한 변경 실패: " + e.message); }
  }
  async function setActive(u, active) {
    setErr(""); setMsg("");
    try { await call(`/api/admin/users/${u.id}/status?active=${active}`, { method: "PUT", credentials: "include" }); setMsg(`${u.name} 계정 → ${active ? "활성" : "정지"}`); loadUsers(uPage.number); }
    catch (e) { setErr("계정상태 변경 실패: " + e.message); }
  }

  async function loadSyncMatches(date) {
    setSyncMatches([]);
    if (!date) return;
    try {
      const pg = asPage(await call(`/api/match/MatchDay?date=${date}&page=0&size=20`));
      setSyncMatches(pg.content);
    } catch { setSyncMatches([]); }
  }
  async function syncNow() {
    if (!syncMatchId) { setErr("matchId를 입력하거나 경기를 선택하세요."); return; }
    setErr(""); setMsg(""); setSyncBusy(true);
    try {
      const view = await call(`/api/match/${syncMatchId}/fotmob/sync`, { method: "POST", credentials: "include" });
      setMsg(`✅ matchId=${syncMatchId} 동기화 완료 — ${view.status} / 라인업 ${view.lineup?.length ?? 0}명 / 이벤트 ${view.events?.length ?? 0}건`);
    } catch (e) { setErr("동기화 실패: " + e.message); }
    finally { setSyncBusy(false); }
  }

  return (
    <div>
      <div style={S.panel}>
        <h3 style={S.h3}>
          관리자 페이지 <span style={S.tag}>공지 / 유저 관리</span>
          <span style={{ ...S.tag, background: isAdmin ? "#14532d" : "#334155", color: isAdmin ? "#86efac" : "#94a3b8" }}>
            {isAdmin ? "🟢 관리자" : "👁 비관리자"}
          </span>
        </h3>
        {!isAdmin && meChecked && (
          <div style={S.row}>
            <span style={S.desc}>관리자만 공지 작성·유저 관리가 가능합니다.</span>
            <button style={S.btnGhost} onClick={login}>Google 로그인</button>
          </div>
        )}
        {err && <div style={S.error}>⚠️ {err}</div>}
        {msg && <div style={S.info}>{msg}</div>}
      </div>

      {isAdmin && (
        <div style={S.panel}>
          <h3 style={S.h3}>🔄 경기 즉시 동기화 <span style={S.tag}>이벤트·라인업·스코어 재수집</span></h3>
          <div style={S.row}>
            <input type="date" style={S.input} value={syncDate}
              onChange={(e) => { setSyncDate(e.target.value); loadSyncMatches(e.target.value); }} />
            <input style={{ ...S.input, width: 110 }} value={syncMatchId}
              onChange={(e) => setSyncMatchId(e.target.value)} placeholder="matchId" />
            <button style={S.btn} disabled={syncBusy} onClick={syncNow}>
              {syncBusy ? "동기화 중..." : "지금 동기화"}
            </button>
          </div>
          {syncMatches.length > 0 && (
            <div style={{ ...S.matchList, marginTop: 8 }}>
              {syncMatches.map((m) => (
                <div key={m.id}
                  style={{ ...S.matchRow, outline: String(m.id) === String(syncMatchId) ? "2px solid #2563eb" : "none" }}
                  onClick={() => setSyncMatchId(String(m.id))}>
                  <span style={S.comp}>{m.competition?.name}{m.groupName ? ` · ${m.groupName}` : ""}</span>
                  <div style={S.teams}>
                    <Team t={m.homeTeam} align="right" />
                    <b style={S.vs}>{m.homeScore ?? "-"} : {m.awayScore ?? "-"}</b>
                    <Team t={m.awayTeam} align="left" />
                  </div>
                  <span style={S.time}>#{m.id} · {m.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div style={S.panel}>
          <h3 style={S.h3}>📢 공지 작성</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
            <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={content} onChange={(e) => setContent(e.target.value)}
                      placeholder="예) 다가오는 12일 11시에 진행하는 한국 vs 체코 많은 응원 부탁드립니다." />
            <div><button style={S.btn} onClick={createNotice}>공지 등록</button></div>
          </div>
        </div>
      )}

      <div style={S.panel}>
        <h3 style={S.h3}>공지 목록 <span style={S.tag}>{nPage.totalElements}건</span></h3>
        {notices.length === 0 ? <p style={S.desc}>공지가 없습니다.</p> : notices.map((n) => (
          <div key={n.id} style={S.noticeRow}>
            <div style={{ flex: 1 }}>
              <b>{n.title}</b>
              <div style={S.desc}>{n.content}</div>
              <div style={S.noticeMeta}>{n.authorName} · {kst(n.createAt)}</div>
            </div>
            {isAdmin && <button style={S.btnGhost} onClick={() => deleteNotice(n.id)}>삭제</button>}
          </div>
        ))}
        <Pager page={nPage.number} totalPages={nPage.totalPages} totalElements={nPage.totalElements} onPage={loadNotices} />
      </div>

      {isAdmin && (
        <div style={S.panel}>
          <h3 style={S.h3}>👥 유저 관리</h3>
          <button style={S.btnGhost} onClick={() => loadUsers(0)}>유저 목록 불러오기</button>
          {users.length > 0 && (
            <table style={{ ...S.table, marginTop: 10 }}>
              <thead><tr>
                <th style={S.th}>#</th><th style={S.thL}>이름</th><th style={S.thL}>이메일</th>
                <th style={S.th}>권한</th><th style={S.th}>상태</th><th style={S.th}>관리</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={S.td}>{u.id}</td>
                    <td style={S.tdL}>{u.name}</td>
                    <td style={S.tdL}>{u.email}</td>
                    <td style={S.td}>
                      <select value={u.role} onChange={(e) => setRole(u, e.target.value)} style={{ ...S.input, padding: "4px 6px" }}>
                        <option value="COMMON_USER">COMMON_USER</option>
                        <option value="ADMIN_USER">ADMIN_USER</option>
                      </select>
                    </td>
                    <td style={S.td}>
                      <span style={{ color: u.active ? "#4ade80" : "#f87171", fontWeight: 700 }}>{u.active ? "활성" : "정지"}</span>
                    </td>
                    <td style={S.td}>
                      {u.active
                        ? <button style={S.btnGhost} onClick={() => setActive(u, false)}>정지</button>
                        : <button style={S.btn} onClick={() => setActive(u, true)}>활성화</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager page={uPage.number} totalPages={uPage.totalPages} totalElements={uPage.totalElements} onPage={loadUsers} />
        </div>
      )}
    </div>
  );
}

// 다크 테마 팔레트: 배경 #0f172a(페이지)/#1e293b(패널)/#0f172a(카드), 텍스트 #e2e8f0, 보조 #94a3b8
const S = {
  page: { maxWidth: 940, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#e2e8f0", textAlign: "left" },
  h1: { fontSize: 24, marginBottom: 12, color: "#f1f5f9" }, sub: { fontSize: 12, color: "#94a3b8", fontWeight: 400 },
  tabs: { display: "flex", gap: 6, marginBottom: 16 },
  tab: { padding: "8px 18px", border: "1px solid #334155", background: "#1e293b", color: "#cbd5e1", borderRadius: 8, cursor: "pointer", fontSize: 14 },
  tabOn: { background: "#2563eb", color: "#fff", borderColor: "#2563eb", fontWeight: 600 },
  panel: { background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 18, marginBottom: 16 },
  h3: { fontSize: 16, margin: "0 0 10px", color: "#f1f5f9" }, h4: { fontSize: 14, margin: "0 0 6px", color: "#cbd5e1" },
  tag: { fontSize: 11, background: "#312e81", color: "#c7d2fe", padding: "2px 8px", borderRadius: 10, marginLeft: 6 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  desc: { color: "#94a3b8", fontSize: 12 },
  input: { padding: "8px 10px", border: "1px solid #475569", borderRadius: 8, fontSize: 14, background: "#0f172a", color: "#e2e8f0", colorScheme: "dark" },
  btn: { padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600 },
  btnGhost: { padding: "7px 13px", background: "#334155", color: "#e2e8f0", border: "1px solid #475569", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  error: { background: "#450a0a", color: "#fca5a5", padding: 10, borderRadius: 8, marginTop: 10 },
  info: { background: "#172554", color: "#93c5fd", padding: 10, borderRadius: 8, marginTop: 4 },
  noticeBanner: { background: "#451a03", border: "1px solid #92400e", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 },
  noticeItem: { fontSize: 13, color: "#fcd34d" },
  noticeMeta: { color: "#d97706", fontSize: 11 },
  noticeRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #334155" },
  matchList: { marginTop: 12, display: "flex", flexDirection: "column", gap: 6 },
  matchRow: { display: "grid", gridTemplateColumns: "180px 1fr 150px", alignItems: "center", gap: 10, padding: "8px 12px", background: "#0f172a", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  comp: { color: "#94a3b8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  teams: { display: "flex", alignItems: "center", gap: 10, justifyContent: "center" },
  team: { display: "flex", alignItems: "center", gap: 6, flex: 1 },
  vs: { fontSize: 14, minWidth: 44, textAlign: "center" },
  time: { color: "#94a3b8", fontSize: 12, textAlign: "right" },
  timeline: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 },
  event: { fontSize: 14, padding: "4px 8px", background: "#0f172a", borderRadius: 6, position: "relative" },
  min: { display: "inline-block", minWidth: 32, color: "#94a3b8", fontWeight: 600 },
  detail: { color: "#94a3b8", fontSize: 13 }, side: { position: "absolute", right: 8, top: 4, fontSize: 11, color: "#64748b" },
  lineupWrap: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  col: { background: "#0f172a", borderRadius: 10, padding: 12 },
  colTitle: { fontSize: 14, margin: "0 0 8px", textAlign: "center", color: "#e2e8f0" },
  subhead: { fontSize: 12, color: "#94a3b8", margin: "8px 0 4px", fontWeight: 600 },
  player: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 },
  shirt: { minWidth: 22, textAlign: "center", color: "#94a3b8" },
  pname: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  subInfo: { fontSize: 11, color: "#f87171" },
  rating: { color: "#fff", fontSize: 12, fontWeight: 700, padding: "1px 6px", borderRadius: 6, minWidth: 30, textAlign: "center" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "6px 4px", borderBottom: "2px solid #475569", textAlign: "center", color: "#94a3b8", fontSize: 12 },
  thL: { padding: "6px 4px", borderBottom: "2px solid #475569", textAlign: "left", color: "#94a3b8", fontSize: 12 },
  td: { padding: "5px 4px", borderBottom: "1px solid #334155", textAlign: "center" },
  tdL: { padding: "5px 4px", borderBottom: "1px solid #334155", textAlign: "left" },
  aiCard: { background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 12 },
  summaryBox: { marginTop: 8, padding: "10px 12px", background: "#172554", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#bfdbfe" },
  pitch: { position: "relative", height: 300, borderRadius: 8, margin: "4px 0",
    background: "repeating-linear-gradient(0deg,#14532d 0 30px,#15803d 30px 60px)", border: "2px solid #052e16", overflow: "hidden" },
  pitchPlayer: { position: "absolute", transform: "translate(-50%, 50%)", textAlign: "center", width: 56 },
  pitchDot: { position: "relative", width: 30, height: 30, borderRadius: "50%", color: "#111", fontSize: 11,
    fontWeight: 700, lineHeight: "30px", margin: "0 auto", background: "#e2e8f0", overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,.45)" },
  pitchImg: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  avatar: { width: 22, height: 22, borderRadius: "50%", objectFit: "cover", background: "#334155",
    display: "inline-block", flexShrink: 0 },
  pitchName: { fontSize: 9, color: "#fff", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis",
    whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,.7)" },
};
