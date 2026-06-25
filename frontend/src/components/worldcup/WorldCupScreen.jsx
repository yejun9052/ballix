// 월드컵 화면 — 조별리그 그리드/상세 + 토너먼트 브래킷(중심 대칭, 자동 스케일)
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveClock } from "../common/LiveClock.jsx";
import { teamKo, getTeamNameByOriginal, teamTla } from "../../utils/team.js";
import { getStandings } from "../../api/standings.js";
import { getPageContent } from "../../utils/format.js";
import {
  buildStandingsByLetter,
  buildThirdPlaceRanking,
  computeQualifiers,
  qualStatus,
} from "../../utils/wcStandings.js";

// 월드컵 Competition PK 폴백 (보통은 매치 데이터에서 동적으로 가져옴)
const WC_COMPETITION_ID = 6;

export const WC_GROUPS = [
  "Grp. A", "Grp. B", "Grp. C", "Grp. D",
  "Grp. E", "Grp. F", "Grp. G", "Grp. H",
  "Grp. I", "Grp. J", "Grp. K", "Grp. L",
];

// FotMob 그룹키 → 표시 문자 (예: "Grp. A" → "A")

export function wcGroupLetter(key) {
  return key.replace("Grp. ", "");
}

// 팀 이름 한글화 (countryNameKo 사용)

export function WorldCupScreen({ matches, onBack, onSelectMatch }) {
  const [tab, setTab] = useState("group");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [standings, setStandings] = useState([]);

  const wcMatches = matches.filter((m) => m.isWorldCup);

  // 월드컵 Competition PK는 환경마다 달라(예: 2 vs 6) 매치 데이터에서 동적으로 가져온다
  const wcCompetitionId =
    wcMatches.find((m) => m.raw?.competition?.id)?.raw?.competition?.id ??
    WC_COMPETITION_ID;

  useEffect(() => {
    getStandings(wcCompetitionId)
      .then((data) => setStandings(getPageContent(data)))
      .catch(() => setStandings([]));
  }, [wcCompetitionId]);

  const standingsByLetter = useMemo(
    () => buildStandingsByLetter(standings),
    [standings],
  );
  const quals = useMemo(
    () => computeQualifiers(standingsByLetter),
    [standingsByLetter],
  );
  const thirdRanking = useMemo(
    () => buildThirdPlaceRanking(standingsByLetter),
    [standingsByLetter],
  );
  const qualifiedCount = quals.direct.size + quals.wildcard.size;

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
          <WcGroupGrid
            wcMatches={wcMatches}
            standingsByLetter={standingsByLetter}
            quals={quals}
            qualifiedCount={qualifiedCount}
            thirdRanking={thirdRanking}
            onSelectGroup={setSelectedGroup}
          />
        )}
        {tab === "group" && selectedGroup && (
          <WcGroupDetail
            groupKey={selectedGroup}
            wcMatches={wcMatches}
            standingsByLetter={standingsByLetter}
            quals={quals}
            onSelectMatch={onSelectMatch}
          />
        )}
        {tab === "bracket" && (
          <WcBracket
            wcMatches={wcMatches}
            standingsByLetter={standingsByLetter}
            quals={quals}
            onSelectMatch={onSelectMatch}
            onSelectGroup={handleGroupFromBracket}
          />
        )}
      </div>
    </div>
  );
}

export function WcGroupGrid({ wcMatches, standingsByLetter, quals, qualifiedCount, thirdRanking, onSelectGroup }) {
  // 경기 데이터의 Team.nameKo(DB 번역값)로 fotmobTeamId/영문명 → 한국어 룩업 구성. 프론트 맵은 폴백.
  const koMap = {};
  for (const m of wcMatches) {
    for (const t of [m.raw?.homeTeam, m.raw?.awayTeam]) {
      if (!t?.nameKo) continue;
      if (t.fotmobTeamId != null) koMap[`id:${t.fotmobTeamId}`] = t.nameKo;
      if (t.name) koMap[`name:${t.name}`] = t.nameKo;
    }
  }
  const koByStanding = (row) => koMap[`id:${row.fotmobTeamId}`] || getTeamNameByOriginal(row.teamName);
  const koByOriginal = (name) => koMap[`name:${name}`] || teamKo(name);

  return (
    <>
      <div className="wc-qual-legend">
        <span className="wc-qual-legend-title">32강 진출 현황</span>
        <span className="wc-qual-count">{qualifiedCount}<i>/32</i></span>
        <span className="wc-qual-chip direct"><em /> 조 1·2위 직접진출</span>
        <span className="wc-qual-chip wildcard"><em /> 3위 와일드카드 (상위 8)</span>
      </div>

      <div className="wc-group-grid">
        {WC_GROUPS.map((key) => {
          const letter = wcGroupLetter(key);
          const rows = standingsByLetter[letter] || [];
          const grpMatches = wcMatches.filter((m) => m.group === key);
          const teamFallback = [...new Set([
            ...grpMatches.map((m) => m.homeTeamOriginal).filter(Boolean),
            ...grpMatches.map((m) => m.awayTeamOriginal).filter(Boolean),
          ])];
          const hasData = rows.length > 0 || teamFallback.length > 0;
          return (
            <button
              key={key}
              type="button"
              className={`wc-group-card ${!hasData ? "disabled" : ""}`}
              onClick={hasData ? () => onSelectGroup(key) : undefined}
              disabled={!hasData}
            >
              <span className="wc-group-letter">{letter}조</span>

              {rows.length > 0 ? (
                <div className="wc-mini-standings">
                  <div className="wc-ms-head">
                    <span className="wc-ms-rank">순위</span>
                    <span className="wc-ms-nation">나라</span>
                    <span className="wc-ms-pts">승점</span>
                    <span className="wc-ms-gd">득실</span>
                  </div>
                  {rows.map((row, i) => {
                    const status = qualStatus(row, quals);
                    const gd = row.goalDiff ?? 0;
                    const gdText = gd > 0 ? `+${gd}` : `${gd}`;
                    const gdCls = gd > 0 ? "pos" : gd < 0 ? "neg" : "";
                    return (
                      <div key={row.id ?? row.fotmobTeamId} className={`wc-ms-row ${status ?? ""}`}>
                        <span className="wc-ms-rank">{row.rankNo ?? i + 1}</span>
                        <span className="wc-ms-nation">
                          {row.crest && <img src={row.crest} alt="" className="wc-ms-crest" />}
                          <span className="wc-ms-team" title={koByStanding(row)}>{koByStanding(row)}</span>
                        </span>
                        <span className="wc-ms-pts">{row.points ?? 0}</span>
                        <span className={`wc-ms-gd ${gdCls}`}>{gdText}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ul className="wc-group-teams">
                  {teamFallback.length > 0
                    ? teamFallback.map((t) => <li key={t}>{koByOriginal(t)}</li>)
                    : <li className="wc-na">TBD</li>}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      <WcWildcardTable thirdRanking={thirdRanking} onSelectGroup={onSelectGroup} />
    </>
  );
}

// 3위 와일드카드 순위표 — 12개 조 3위를 한 줄로 줄세워 상위 8팀 진출 표시
export function WcWildcardTable({ thirdRanking, onSelectGroup }) {
  if (!thirdRanking || thirdRanking.length === 0) return null;
  return (
    <section className="wc-wildcard">
      <div className="wc-wildcard-hdr">
        <span className="wc-wildcard-title">3위 와일드카드 순위</span>
        <span className="wc-wildcard-sub">각 조 3위 중 상위 8팀 진출</span>
      </div>
      <div className="wc-standings-card">
        <table className="wc-standings-table wc-wildcard-table">
          <thead>
            <tr>
              <th className="c-rank">#</th>
              <th className="c-team">팀</th>
              <th>조 순위</th>
              <th>경기</th>
              <th>득실</th>
              <th>승점</th>
            </tr>
          </thead>
          <tbody>
            {thirdRanking.map(({ row, letter, rank, qualified }) => (
              <tr
                key={row.id ?? row.fotmobTeamId}
                className={`wc-st-row ${qualified ? "wildcard" : "out"} ${onSelectGroup ? "clickable" : ""}`}
                role={onSelectGroup ? "button" : undefined}
                tabIndex={onSelectGroup ? 0 : undefined}
                onClick={onSelectGroup ? () => onSelectGroup(`Grp. ${letter}`) : undefined}
                onKeyDown={onSelectGroup ? (e) => e.key === "Enter" && onSelectGroup(`Grp. ${letter}`) : undefined}
              >
                <td className="c-rank"><span className="wc-st-rank">{rank}</span></td>
                <td className="c-team">
                  {row.crest && <img src={row.crest} alt="" className="wc-st-crest" />}
                  <span>{getTeamNameByOriginal(row.teamName)}</span>
                  {qualified
                    ? <span className="wc-st-tag wildcard">진출</span>
                    : <span className="wc-st-tag out">탈락권</span>}
                </td>
                <td className="wc-wc-grp">{letter}조 {row.rankNo ?? 3}위</td>
                <td>{row.played ?? 0}</td>
                <td>{(row.goalDiff ?? 0) > 0 ? `+${row.goalDiff}` : row.goalDiff ?? 0}</td>
                <td><b className="wc-st-pts">{row.points ?? 0}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wc-standings-foot">
          <span className="wc-qual-chip wildcard"><em /> 상위 8팀 진출</span>
          <span className="wc-qual-chip out"><em /> 9위 이하 탈락권</span>
        </div>
      </div>
    </section>
  );
}

export function WcGroupDetail({ groupKey, wcMatches, standingsByLetter, quals, onSelectMatch }) {
  const letter = wcGroupLetter(groupKey);
  const rows = standingsByLetter[letter] || [];
  const grpMatches = wcMatches
    .filter((m) => m.group === groupKey)
    .sort((a, b) => new Date(a.matchTimeRaw) - new Date(b.matchTimeRaw));

  // 조 내 팀 목록 (순위 데이터 없을 때 폴백)
  const teams = [...new Set([
    ...grpMatches.map((m) => m.homeTeamOriginal).filter(Boolean),
    ...grpMatches.map((m) => m.awayTeamOriginal).filter(Boolean),
  ])];

  return (
    <div className="wc-group-detail">
      <h2 className="wc-group-detail-title">{letter}조</h2>

      {rows.length > 0 ? (
        <div className="wc-standings-card">
          <table className="wc-standings-table">
            <thead>
              <tr>
                <th className="c-rank">#</th>
                <th className="c-team">팀</th>
                <th>경기</th>
                <th>승</th>
                <th>무</th>
                <th>패</th>
                <th>득실</th>
                <th>승점</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const status = qualStatus(row, quals);
                return (
                  <tr key={row.id ?? row.fotmobTeamId} className={`wc-st-row ${status ?? ""}`}>
                    <td className="c-rank"><span className="wc-st-rank">{row.rankNo ?? i + 1}</span></td>
                    <td className="c-team">
                      {row.crest && <img src={row.crest} alt="" className="wc-st-crest" />}
                      <span>{getTeamNameByOriginal(row.teamName)}</span>
                      {status === "direct" && <span className="wc-st-tag direct">진출</span>}
                      {status === "wildcard" && <span className="wc-st-tag wildcard">WC</span>}
                    </td>
                    <td>{row.played ?? 0}</td>
                    <td>{row.wins ?? 0}</td>
                    <td>{row.draws ?? 0}</td>
                    <td>{row.losses ?? 0}</td>
                    <td>{(row.goalDiff ?? 0) > 0 ? `+${row.goalDiff}` : row.goalDiff ?? 0}</td>
                    <td><b className="wc-st-pts">{row.points ?? 0}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="wc-standings-foot">
            <span className="wc-qual-chip direct"><em /> 직접진출</span>
            <span className="wc-qual-chip wildcard"><em /> 와일드카드</span>
          </div>
        </div>
      ) : (
        <div className="wc-group-team-list">
          {teams.map((t) => (
            <span key={t} className="wc-team-chip">{teamKo(t)}</span>
          ))}
        </div>
      )}

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

export const B_SLOT_H  = 82;   // R32 한 슬롯 높이(px)
export const B_BOX_H   = 64;   // 매치 박스 높이(px)
export const B_BOX_W   = 130;  // 매치 박스 너비(px)
export const B_COL_GAP = 40;   // 라운드 사이 간격(px)
export const B_HDR_H   = 26;   // 라운드 라벨 높이(px)
export const B_GRP_W   = 108;  // 그룹 미니 패널 너비(px)
export const B_CTR_W   = 148;  // 결승 박스 너비(px)

// X 좌표 계산
export const B_GP_L  = 0;
export const B_R32_L = B_GRP_W + B_COL_GAP;                        // 148
export const B_R16_L = B_R32_L + B_BOX_W + B_COL_GAP;              // 318
export const B_QF_L  = B_R16_L + B_BOX_W + B_COL_GAP;              // 488
export const B_SF_L  = B_QF_L  + B_BOX_W + B_COL_GAP;              // 658
export const B_CTR   = B_SF_L  + B_BOX_W + B_COL_GAP;              // 828
export const B_SF_R  = B_CTR   + B_CTR_W + B_COL_GAP;              // 1016
export const B_QF_R  = B_SF_R  + B_BOX_W + B_COL_GAP;              // 1186
export const B_R16_R = B_QF_R  + B_BOX_W + B_COL_GAP;              // 1356
export const B_R32_R = B_R16_R + B_BOX_W + B_COL_GAP;              // 1526
export const B_GP_R  = B_R32_R + B_BOX_W + B_COL_GAP;              // 1696
export const B_TOTAL_W = B_GP_R + B_GRP_W;                          // 1804
export const B_TOTAL_H = B_HDR_H + 8 * B_SLOT_H + B_BOX_H + 28;   // 714

// 슬롯 중심 Y: roundIdx(0=R32..3=SF), slotIdx
export function bSlotY(roundIdx, slotIdx) {
  const span = Math.pow(2, roundIdx);
  return B_HDR_H + B_SLOT_H * (slotIdx * span + span / 2);
}

// 왼쪽/오른쪽 커넥터 정의 (SF→Final은 별도)
export const B_LEFT_COLS = [
  { x: B_R32_L, nextX: B_R16_L, count: 8, ri: 0 },
  { x: B_R16_L, nextX: B_QF_L,  count: 4, ri: 1 },
  { x: B_QF_L,  nextX: B_SF_L,  count: 2, ri: 2 },
];
export const B_RIGHT_COLS = [
  { x: B_R32_R, nextX: B_R16_R, count: 8, ri: 0 },
  { x: B_R16_R, nextX: B_QF_R,  count: 4, ri: 1 },
  { x: B_QF_R,  nextX: B_SF_R,  count: 2, ri: 2 },
];


export function WcBracket({ wcMatches, standingsByLetter, quals, onSelectMatch, onSelectGroup }) {
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
    // FotMob drawOrder(bracketOrder)로 슬롯 위치를 맞춘다 — 없으면 킥오프 시간순 폴백
    return (knockoutByRound[roundKey] || []).slice().sort((a, b) => {
      const ao = a.bracketOrder, bo = b.bracketOrder;
      if (ao != null && bo != null) return ao - bo;
      return new Date(a.matchTimeRaw) - new Date(b.matchTimeRaw);
    });
  }
  function getSlot(roundKey, idx) {
    return getSorted(roundKey)[idx] || null;
  }

  // 토너먼트 대진이 아직 확정되지 않았으면(녹아웃 경기에 라운드/스테이지 정보 없음)
  // 빈 NA 박스로 가득 찬 깨진 브래킷 대신 안내 문구를 보여준다.
  const KNOCKOUT_ROUNDS = [
    "Round of 32", "Round of 16", "Quarter-final",
    "Semi-final", "Final", "Third place play-off",
  ];
  const hasKnockoutData = KNOCKOUT_ROUNDS.some(
    (r) => (knockoutByRound[r] || []).length > 0,
  );
  if (!hasKnockoutData) {
    return (
      <div className="wc-bracket-empty">
        <span className="wc-bracket-empty-icon">🏆</span>
        <strong>토너먼트 대진 준비 중</strong>
        <p>조별리그가 마무리되면 32강 대진표가 여기에 표시됩니다.</p>
        <p className="wc-bracket-empty-sub">현재 조별 순위는 ‘조별리그’ 탭에서 확인하세요.</p>
      </div>
    );
  }

  // ── 매치 박스 (2행: 엠블럼+약자+득점, 승자 강조) ─────────────────────────
  function BoxTeamRow({ crest, original, fallback, goal, played, win, lose }) {
    return (
      <div className={`wc-bx-row ${win ? "win" : ""} ${lose ? "lose" : ""}`}>
        {crest
          ? <img src={crest} alt="" className="wc-bx-crest" />
          : <span className="wc-bx-crest empty" />}
        <span className="wc-bx-code" title={getTeamNameByOriginal(original) || fallback}>
          {teamTla(original) || fallback}
        </span>
        <span className="wc-bx-goal">{played ? goal ?? 0 : ""}</span>
      </div>
    );
  }

  function Box({ roundKey, slotIdx, x, centerY, w }) {
    const bw = w || B_BOX_W;
    const match = getSlot(roundKey, slotIdx);
    const has = Boolean(match);
    const live = match?.statusRaw === "IN_PLAY";
    const played = has && ["IN_PLAY", "FINISHED"].includes(match.statusRaw);
    const hg = match?.raw?.homeScore;
    const ag = match?.raw?.awayScore;
    const winner = match?.raw?.winner;
    const homeWin = played && (winner ? winner === "HOME_TEAM" : hg > ag);
    const awayWin = played && (winner ? winner === "AWAY_TEAM" : ag > hg);
    const decided = match?.statusRaw === "FINISHED";
    return (
      <div
        key={`bx-${roundKey}-${slotIdx}`}
        className={`wc-bracket-box ${has ? "has-match" : "na"} ${live ? "live" : ""}`}
        style={{ position: "absolute", left: x, top: centerY - B_BOX_H / 2, width: bw, height: B_BOX_H }}
        role={has ? "button" : undefined}
        tabIndex={has ? 0 : undefined}
        onClick={has ? () => onSelectMatch(match) : undefined}
        onKeyDown={has ? (e) => e.key === "Enter" && onSelectMatch(match) : undefined}
      >
        {has ? (
          <>
            <BoxTeamRow crest={match.homeCrest} original={match.homeTeamOriginal} fallback={match.homeTeam}
              goal={hg} played={played} win={homeWin} lose={decided && !homeWin} />
            <BoxTeamRow crest={match.awayCrest} original={match.awayTeamOriginal} fallback={match.awayTeam}
              goal={ag} played={played} win={awayWin} lose={decided && !awayWin} />
            <div className="wc-bx-foot">
              {live
                ? <LiveClock match={match} />
                : played
                  ? <span className="wc-bx-ft">종료</span>
                  : <span className="wc-bx-time">{match.matchTime}</span>}
            </div>
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
    const rows   = standingsByLetter[wcGroupLetter(groupKey)] || [];
    const grpMs  = wcMatches.filter((m) => m.group === groupKey);
    const teams  = [...new Set([
      ...grpMs.map((m) => m.homeTeamOriginal).filter(Boolean),
      ...grpMs.map((m) => m.awayTeamOriginal).filter(Boolean),
    ])];
    const hasData = rows.length > 0 || teams.length > 0;
    const top = B_HDR_H + panelIdx * gpSlotH;
    return (
      <div
        key={groupKey}
        className={`wc-mini-group ${hasData && onSelectGroup ? "clickable" : ""}`}
        style={{ position: "absolute", left: x, top, width: B_GRP_W, height: gpSlotH - 4 }}
        role={hasData && onSelectGroup ? "button" : undefined}
        tabIndex={hasData && onSelectGroup ? 0 : undefined}
        onClick={hasData && onSelectGroup ? () => onSelectGroup(groupKey) : undefined}
        onKeyDown={hasData && onSelectGroup ? (e) => e.key === "Enter" && onSelectGroup(groupKey) : undefined}
      >
        <div className="wc-mini-letter">{letter}조</div>
        <div className="wc-mini-teams">
          {rows.length > 0
            ? rows.slice(0, 4).map((row, i) => {
                const status = qualStatus(row, quals);
                return (
                  <div key={row.id ?? row.fotmobTeamId} className={`wc-mini-team standing ${status ?? ""}`} title={getTeamNameByOriginal(row.teamName)}>
                    <span className="wc-mini-seed">{row.rankNo ?? i + 1}</span>
                    {row.crest && <img src={row.crest} alt="" className="wc-mini-crest" />}
                    <span className="wc-mini-name">{teamTla(row.teamName)}</span>
                    <span className="wc-mini-pts">{row.points ?? 0}</span>
                  </div>
                );
              })
            : teams.length > 0
              ? teams.slice(0, 4).map((t) => <div key={t} className="wc-mini-team" title={getTeamNameByOriginal(t)}>{teamTla(t)}</div>)
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
