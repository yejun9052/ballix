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

// 미리보기/뷰 필드명 흡수
const normLineup = (p) => ({
  name: p.name, shirt: p.shirtNumber ?? p.shirt,
  home: p.isHome ?? p.home, starter: p.isStarter ?? p.starter,
  rating: p.rating, subIn: p.subInMinute, subOut: p.subOutMinute,
});
const normEvent = (e) => ({
  minute: e.minute, type: e.type, home: e.isHome ?? e.home,
  player: e.playerName, detail: e.detail,
});
const eventIcon = (e) => e.type === "CARD" ? (e.detail === "Red" ? "🟥" : "🟨") : ({ GOAL: "⚽", SUB: "🔄" }[e.type] || "•");
const ratingColor = (r) => r == null ? "#888" : r >= 7.5 ? "#1a9850" : r >= 7.0 ? "#66bd63" : r >= 6.5 ? "#fdae61" : "#d73027";
const kst = (iso) => iso ? iso.replace("T", " ").slice(0, 16) : "";

export default function FotmobTester() {
  const [tab, setTab] = useState("schedule");
  return (
    <div style={S.page}>
      <h1 style={S.h1}>⚽ FotMob 콘솔 <span style={S.sub}>모든 결과는 콘솔(F12)에도 출력</span></h1>
      <div style={S.tabs}>
        {[["schedule", "📅 일정"], ["standings", "🏆 순위"], ["predict", "🎯 예측"], ["tools", "🛠 도구"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }}>{label}</button>
        ))}
      </div>
      {tab === "schedule" && <SchedulePanel />}
      {tab === "standings" && <StandingsPanel />}
      {tab === "predict" && <PredictionPanel />}
      {tab === "tools" && <ToolsPanel />}
    </div>
  );
}

// ── 일정 탭: 날짜별 경기 → 클릭하면 라인업/이벤트 ──
function SchedulePanel() {
  const [date, setDate] = useState("2026-06-13");
  const [matches, setMatches] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true); setErr(""); setDetail(null);
    try {
      const data = await call(`/api/match/MatchDay?date=${date}`);
      setMatches(data || []);
    } catch (e) { setErr(e.message); setMatches([]); }
    finally { setLoading(false); }
  }

  async function openMatch(m) {
    setErr("");
    try {
      // 이미 저장된 라인업/이벤트 조회. 없으면 즉시 동기화.
      let view = await call(`/api/match/${m.id}/fotmob`);
      if (!view.lineup?.length) {
        view = await call(`/api/match/${m.id}/fotmob/sync`, { method: "POST" });
      }
      const lineups = (view.lineup || []).map(normLineup);
      const events = (view.events || []).map(normEvent);
      console.group(`%c[경기] ${m.homeTeam?.name} vs ${m.awayTeam?.name}`, "color:#2563eb;font-weight:bold");
      if (lineups.length) console.table(lineups);
      if (events.length) console.table(events);
      console.groupEnd();
      setDetail({ match: m, lineups, events });
    } catch (e) { setErr("조회 실패: " + e.message); }
  }

  return (
    <div>
      <div style={S.panel}>
        <div style={S.row}>
          <input type="date" style={S.input} value={date} onChange={(e) => setDate(e.target.value)} />
          <button style={S.btn} onClick={load} disabled={loading}>{loading ? "불러오는 중..." : "일정 불러오기"}</button>
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
                <span style={S.time}>{kst(m.matchTime)} · {m.status}</span>
              </div>
            ))}
          </div>
        )}
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
  const { match, lineups, events } = detail;
  const home = lineups.filter((p) => p.home);
  const away = lineups.filter((p) => !p.home);
  return (
    <div style={S.panel}>
      <h3 style={S.h3}>{match.homeTeam?.name} vs {match.awayTeam?.name}</h3>
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
        <div style={S.lineupWrap}>
          <LineupCol title={match.homeTeam?.name} players={home} />
          <LineupCol title={match.awayTeam?.name} players={away} />
        </div>
      ) : <p style={S.desc}>라인업이 아직 없습니다 (경기 1시간 전부터 공개).</p>}
    </div>
  );
}

function LineupCol({ title, players }) {
  const starters = players.filter((p) => p.starter);
  const subs = players.filter((p) => !p.starter);
  return (
    <div style={S.col}>
      <h4 style={S.colTitle}>{title}</h4>
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
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(sync) {
    setLoading(true); setErr("");
    try {
      const path = `/api/fotmob/standings/${compId}` + (sync ? "/sync" : "");
      const data = await call(path, sync ? { method: "POST" } : undefined);
      // 조별 그룹핑
      const byGroup = {};
      (data || []).forEach((r) => {
        const g = r.groupName || "전체";
        (byGroup[g] = byGroup[g] || []).push(r);
      });
      setGroups(Object.entries(byGroup));
    } catch (e) { setErr(e.message); setGroups([]); }
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
    </div>
  );
}

// ── 예측 탭: 로그인 → WC 경기 불러오기 → 클릭 예측 → 내 예측 조회 ──
const WINNER_LABEL = { HOME_TEAM: "홈 승", DRAW: "무", AWAY_TEAM: "원정 승" };

function PredictionPanel() {
  const cred = { credentials: "include" }; // JWT 쿠키 동봉

  const [compId, setCompId] = useState("6"); // WC 내부 competitionId
  const [matches, setMatches] = useState([]);
  const [matchId, setMatchId] = useState("");
  const [winner, setWinner] = useState("HOME_TEAM");
  const [mine, setMine] = useState([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function login() { window.location.href = API + "/oauth2/authorization/google"; }
  async function logout() {
    setErr(""); setMine([]);
    try { await call("/api/auth/logout", { method: "POST", ...cred }); setMsg("로그아웃됨"); }
    catch (e) { setErr(e.message); }
  }

  // WC 경기 목록 (예측 대상) — 가까운 미래 순
  async function loadMatches() {
    setErr(""); setMsg("");
    try {
      const data = await call(`/api/match/findByCompId?id=${compId}`);
      const sorted = [...(data || [])].sort((a, b) => (a.matchTime > b.matchTime ? 1 : -1));
      setMatches(sorted);
      setMsg(`${sorted.length}경기 로드`);
    } catch (e) { setErr(e.message); setMatches([]); }
  }

  // 예측하기 / 재예측
  async function doPredict() {
    setErr(""); setMsg("");
    if (!matchId) { setErr("matchId를 선택하거나 입력하세요."); return; }
    try {
      const d = await call(`/api/prediction/predict?matchId=${matchId}&predictedWinner=${winner}`, { method: "POST", ...cred });
      setMsg(`✅ 예측 저장: matchId=${matchId} → ${d.predictedWinner} (${WINNER_LABEL[d.predictedWinner] || ""})`);
    } catch (e) { setErr("예측 실패: " + e.message); }
  }

  // 내 예측 전부
  async function loadMine() {
    setErr(""); setMsg("");
    try { const d = await call("/api/prediction/myPrediction", cred); setMine(d || []); setMsg(`내 예측 ${d?.length || 0}건`); }
    catch (e) { setErr(e.message); setMine([]); }
  }

  const fmtCorrect = (v) => v == null ? "⏳ 대기" : v ? "🟢 적중" : "🔴 실패";
  // enum → 팀 이름 라벨 (경기 정보 있으면 팀명, 없으면 홈/원정)
  const pickLabel = (p) => {
    if (p.predictedWinner === "HOME_TEAM") return p.match?.homeTeam?.name || "홈 승";
    if (p.predictedWinner === "AWAY_TEAM") return p.match?.awayTeam?.name || "원정 승";
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
          <button style={S.btn} onClick={loadMatches}>경기 불러오기</button>
          <span style={S.desc}>WC 내부 compId=6 · 경기를 클릭하면 아래 예측 폼에 자동 입력</span>
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
          <button style={S.btnGhost} onClick={loadMine}>내 예측 조회</button>
        </div>
        {err && <div style={S.error}>⚠️ {err}</div>}
        {msg && <div style={S.info}>{msg}</div>}
      </div>

      {mine.length > 0 && (
        <div style={S.panel}>
          <h3 style={S.h3}>내 예측 ({mine.length})</h3>
          <table style={S.table}>
            <thead><tr><th style={S.th}>matchId</th><th style={S.thL}>예측</th><th style={S.th}>채점</th></tr></thead>
            <tbody>
              {mine.map((p) => (
                <tr key={p.id}>
                  <td style={S.td}>{p.match?.id ?? "-"}</td>
                  <td style={S.tdL}>{pickLabel(p)} <span style={S.desc}>({p.predictedWinner})</span></td>
                  <td style={S.td}>{fmtCorrect(p.isCorrect)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 도구 탭: 미리보기 / 일정 동기화 / 폴링 주기 ──
function ToolsPanel() {
  const [fid, setFid] = useState("5451162");
  const [interval, setIntervalV] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { call("/api/fotmob/poll-interval").then(setIntervalV).catch(() => {}); }, []);

  async function preview() {
    setMsg("미리보기 불러오는 중...");
    try {
      const d = await call(`/api/fotmob/preview/${fid}`);
      console.group("%c[미리보기]", "color:#2563eb;font-weight:bold");
      console.table((d.lineups || []).map(normLineup));
      console.table((d.events || []).map(normEvent));
      console.groupEnd();
      setMsg(`${d.homeTeamName} ${d.homeScore}-${d.awayScore} ${d.awayTeamName} · 라인업 ${d.lineups?.length || 0} / 이벤트 ${d.events?.length || 0} (콘솔 확인)`);
    } catch (e) { setMsg("실패: " + e.message); }
  }
  async function syncSchedule() {
    setMsg("일정 동기화 중... (수십초 걸릴 수 있음)");
    try { const n = await call("/api/fotmob/schedule/sync?pastDays=10&futureDays=10", { method: "POST" }); setMsg(`일정 ${n}경기 동기화 완료`); }
    catch (e) { setMsg("실패: " + e.message); }
  }
  async function setPoll(minutes) {
    try { const v = await call(`/api/fotmob/poll-interval?minutes=${minutes}`, { method: "POST" }); setIntervalV(v); setMsg(`폴링 주기 ${v}분으로 변경`); }
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
        <h3 style={S.h3}>일정 동기화 <span style={S.tag}>과거·미래 10일</span></h3>
        <button style={S.btn} onClick={syncSchedule}>지금 일정 동기화</button>
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

const S = {
  page: { maxWidth: 940, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#1a1a2e", textAlign: "left" },
  h1: { fontSize: 24, marginBottom: 12 }, sub: { fontSize: 12, color: "#94a3b8", fontWeight: 400 },
  tabs: { display: "flex", gap: 6, marginBottom: 16 },
  tab: { padding: "8px 18px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 14 },
  tabOn: { background: "#2563eb", color: "#fff", borderColor: "#2563eb", fontWeight: 600 },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 16 },
  h3: { fontSize: 16, margin: "0 0 10px" }, h4: { fontSize: 14, margin: "0 0 6px", color: "#334155" },
  tag: { fontSize: 11, background: "#eef2ff", color: "#4338ca", padding: "2px 8px", borderRadius: 10, marginLeft: 6 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  desc: { color: "#94a3b8", fontSize: 12 },
  input: { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14 },
  btn: { padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600 },
  btnGhost: { padding: "7px 13px", background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  error: { background: "#fef2f2", color: "#b91c1c", padding: 10, borderRadius: 8, marginTop: 10 },
  info: { background: "#eff6ff", color: "#1e40af", padding: 10, borderRadius: 8, marginTop: 4 },
  matchList: { marginTop: 12, display: "flex", flexDirection: "column", gap: 6 },
  matchRow: { display: "grid", gridTemplateColumns: "180px 1fr 150px", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  comp: { color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  teams: { display: "flex", alignItems: "center", gap: 10, justifyContent: "center" },
  team: { display: "flex", alignItems: "center", gap: 6, flex: 1 },
  vs: { fontSize: 14, minWidth: 44, textAlign: "center" },
  time: { color: "#64748b", fontSize: 12, textAlign: "right" },
  timeline: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 },
  event: { fontSize: 14, padding: "4px 8px", background: "#f8fafc", borderRadius: 6, position: "relative" },
  min: { display: "inline-block", minWidth: 32, color: "#64748b", fontWeight: 600 },
  detail: { color: "#64748b", fontSize: 13 }, side: { position: "absolute", right: 8, top: 4, fontSize: 11, color: "#94a3b8" },
  lineupWrap: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  col: { background: "#f8fafc", borderRadius: 10, padding: 12 },
  colTitle: { fontSize: 14, margin: "0 0 8px", textAlign: "center" },
  subhead: { fontSize: 12, color: "#94a3b8", margin: "8px 0 4px", fontWeight: 600 },
  player: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 },
  shirt: { minWidth: 22, textAlign: "center", color: "#64748b" },
  pname: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  subInfo: { fontSize: 11, color: "#dc2626" },
  rating: { color: "#fff", fontSize: 12, fontWeight: 700, padding: "1px 6px", borderRadius: 6, minWidth: 30, textAlign: "center" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "6px 4px", borderBottom: "2px solid #e2e8f0", textAlign: "center", color: "#64748b", fontSize: 12 },
  thL: { padding: "6px 4px", borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#64748b", fontSize: 12 },
  td: { padding: "5px 4px", borderBottom: "1px solid #f1f5f9", textAlign: "center" },
  tdL: { padding: "5px 4px", borderBottom: "1px solid #f1f5f9", textAlign: "left" },
};
