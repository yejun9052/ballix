// 선수 모달 — 경기별 스탯(카테고리 그룹) + 기본 프로필 + 시즌 스탯
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getPlayerSeason } from "../../api/match.js";
import { krLabel, krValue } from "../../utils/playerLabels.js";
import { collectPlayerMarks, getRatingClass } from "../../utils/lineup.js";
import { PlayerPhoto } from "./PlayerPhoto.jsx";
import { StateMessage } from "./StateMessage.jsx";

// 시즌 스탯 원본 영문 title → 카테고리
const SEASON_CAT = {
  // 퍼포먼스
  Matches: "perf", "Matches played": "perf", Appearances: "perf",
  Started: "perf", "Minutes played": "perf", Minutes: "perf",
  "FotMob rating": "perf", Rating: "perf",
  // 공격
  Goals: "attack", Assists: "attack", "Goals + Assists": "attack",
  Shots: "attack", "Shots on target": "attack",
  "Chances created": "attack", "Big chances created": "attack",
  "Successful dribbles": "attack", "Expected goals (xG)": "attack",
  xG: "attack", "xG + xA": "attack", "Big chances missed": "attack",
  Offsides: "attack",
  // 패스
  "Pass accuracy": "pass", "Accurate passes": "pass",
  "Long balls": "pass", "Accurate long balls": "pass",
  Crosses: "pass", "Accurate crosses": "pass",
  "Through balls": "pass", Touches: "pass",
  xA: "pass", "Expected assists (xA)": "pass",
  // 수비
  Tackles: "def", Interceptions: "def", Recoveries: "def",
  Clearances: "def", "Blocked shots": "def",
  "Clean sheets": "def", "Goals conceded": "def",
  Saves: "def", "Penalties saved": "def",
  "Aerial duels won": "def", "Ground duels won": "def", "Duels won": "def",
  Dispossessed: "def",
  // 골키퍼
  "xGOT faced": "gk", "Goals prevented": "gk", "Diving save": "gk",
  "Saves inside box": "gk", "Acted as sweeper": "gk",
  Punches: "gk", Throws: "gk", "High claim": "gk",
  // 카드/파울
  "Yellow cards": "card", "Red cards": "card",
  Fouls: "foul", "Fouls committed": "foul", "Was fouled": "foul",
};

// 경기 스탯 한국어 라벨 → 카테고리 (krLabel 변환 후 기준)
const STAT_CAT = {
  // 퍼포먼스
  평점: "perf", "출전 시간": "perf", "교체 투입": "perf", "교체 아웃": "perf", 포지션: "perf",
  // 공격
  골: "attack", 도움: "attack", 슈팅: "attack", "유효 슈팅": "attack",
  "기대 득점(xG)": "attack", "기회 창출": "attack", "결정적 기회 창출": "attack",
  오프사이드: "attack", "드리블 성공": "attack", 피파울: "attack",
  "막힌 슈팅": "attack", "결정적 기회 실패": "attack", "xG + xA": "attack",
  // 패스
  "Accurate passes": "pass", "패스 정확도": "pass", "전방 패스": "pass",
  "정확한 롱볼": "pass", "롱볼 정확도": "pass",
  "Accurate crosses": "pass", "기대 도움(xA)": "pass",
  터치: "pass", "Touches in opposition box": "pass", 스로: "pass",
  // 수비
  태클: "def", 인터셉트: "def", "수비 액션": "def", 걷어내기: "def",
  "볼 빼앗김": "def", "볼 회수": "def", "드리블 허용": "def",
  "Headed clearance": "def", Blocks: "def",
  "경합 승리": "def", "지상 경합 승리": "def", "공중 경합 승리": "def",
  // 골키퍼
  "피xGOT": "gk", "실점 방지": "gk", "다이빙 선방": "gk",
  "박스 안 선방": "gk", "스위퍼 처리": "gk", 펀칭: "gk", "하이볼 처리": "gk",
  // 카드/파울
  경고: "card", 퇴장: "card",
  파울: "foul",
};

const CAT_META = [
  { key: "perf",   label: "퍼포먼스", color: "var(--blue)" },
  { key: "attack", label: "공격",    color: "var(--live)" },
  { key: "pass",   label: "패스",    color: "#2a9d8f" },
  { key: "def",    label: "수비",    color: "var(--win)" },
  { key: "gk",     label: "골키퍼",  color: "#6a4c93" },
  { key: "card",   label: "카드",    color: "var(--yellow-ink)" },
  { key: "foul",   label: "파울",    color: "var(--muted)" },
];

// 소수점 2자리 초과 시 반올림, 정수면 그대로
function fmtVal(v) {
  if (v == null) return "";
  const s = String(v);
  if (!s.includes(".")) return s;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  return parseFloat(n.toFixed(2)).toString();
}

export function PlayerModal({ playerId, fallbackName, matchPlayer, matchTeamName, events = [], onClose }) {
  const isMatchMode = !!matchPlayer;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSeason, setShowSeason] = useState(!isMatchMode);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!playerId) return undefined;
    let mounted = true;
    setLoading(true);
    setError("");
    getPlayerSeason(playerId)
      .then((res) => mounted && setData(res))
      .catch((e) => mounted && setError(e.response?.data?.msg || "선수 정보를 불러오지 못했습니다."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [playerId]);

  const info = data?.info || [];
  const stats = data?.stats || [];
  const name = data?.name || matchPlayer?.name || fallbackName || "선수";
  const teamName = isMatchMode ? matchTeamName : data?.teamName;
  const positionLabel = isMatchMode ? matchPlayer?.position : data?.position;
  const rating = matchPlayer?.rating;

  // 이 경기 스탯 조합
  const marks = matchPlayer ? collectPlayerMarks(events, matchPlayer) : null;
  const detailed = (matchPlayer?.matchStats || []).map((s) => ({ label: krLabel(s.title), value: s.value }));
  const curated = matchPlayer ? [
    !detailed.length && Number.isFinite(rating) ? { label: "평점", value: rating } : null,
    marks?.goals  ? { label: "골",    value: marks.goals }  : null,
    marks?.assists ? { label: "도움",  value: marks.assists } : null,
    marks?.yellow  ? { label: "경고",  value: marks.yellow }  : null,
    marks?.red     ? { label: "퇴장",  value: marks.red }     : null,
    Number.isFinite(matchPlayer.subInMinute)  ? { label: "교체 투입", value: `${matchPlayer.subInMinute}'`  } : null,
    Number.isFinite(matchPlayer.subOutMinute) ? { label: "교체 아웃", value: `${matchPlayer.subOutMinute}'` } : null,
    matchPlayer.position ? { label: "포지션", value: matchPlayer.position } : null,
  ].filter(Boolean) : [];

  const matchStats = (() => {
    const seen = new Set();
    return [...detailed, ...curated].filter((s) => {
      if (s.value == null || s.value === "" || seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  })();

  // 카테고리별 그룹화
  const grouped = {};
  for (const s of matchStats) {
    const cat = STAT_CAT[s.label] || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }
  const otherItems = grouped.other || [];

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card player-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="player-modal-close" onClick={onClose} aria-label="닫기">✕</button>

        <div className="player-modal-scroll">
        {/* 헤더 */}
        <div className="player-modal-head">
          <div className="pm-photo-wrap">
            <PlayerPhoto id={playerId} name={name} />
            {Number.isFinite(rating) && (
              <span className={`rating-chip pm-rating ${getRatingClass(rating)}`}>{rating}</span>
            )}
          </div>
          <div className="player-modal-id">
            <h2>{name}</h2>
            <div className="player-modal-meta">
              {teamName && <span>{teamName}</span>}
              {positionLabel && <span>{positionLabel}</span>}
              {data?.onLoan && <span className="player-modal-loan">임대</span>}
            </div>
          </div>
        </div>

        <div className="player-modal-body">
          {/* 이 경기 스탯 — 카테고리 그룹 */}
          {isMatchMode && (
            <div className="player-modal-block">
              <strong className="player-modal-label">이 경기</strong>
              {matchStats.length > 0 ? (
                <div className="stat-groups">
                  {CAT_META.map(({ key, label, color }) => {
                    const items = grouped[key];
                    if (!items || items.length === 0) return null;
                    return (
                      <div className="stat-group" key={key}>
                        <div className="stat-group-head" style={{ "--cat-color": color }}>
                          {label}
                        </div>
                        <div className="stat-item-grid">
                          {items.map((s) => (
                            <div className="stat-item" key={s.label}>
                              <b className="si-val">{fmtVal(s.value)}</b>
                              <span className="si-lbl">{s.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {otherItems.length > 0 && (
                    <div className="stat-group">
                      <div className="stat-group-head" style={{ "--cat-color": "var(--muted)" }}>기타</div>
                      <div className="stat-item-grid">
                        {otherItems.map((s) => (
                          <div className="stat-item" key={s.label}>
                            <b className="si-val">{fmtVal(s.value)}</b>
                            <span className="si-lbl">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <StateMessage text="이 경기 기록이 아직 없습니다" />
              )}
            </div>
          )}

          {/* 기본 프로필 + 시즌 스탯 */}
          {loading ? (
            <StateMessage text="선수 정보를 불러오는 중" />
          ) : error ? (
            <StateMessage text={error} />
          ) : (
            <>
              {info.length > 0 && (
                <div className="player-modal-block">
                  <strong className="player-modal-label">기본 정보</strong>
                  <div className="player-info-grid">
                    {info.map((it) => (
                      <div className="player-info-item" key={it.label}>
                        <span className="pi-label">{krLabel(it.label)}</span>
                        <b className="pi-value">{krValue(it.label, it.value)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showSeason
                ? stats.length > 0 && (() => {
                    const seasonGrouped = {};
                    for (const s of stats) {
                      const cat = SEASON_CAT[s.title] || "other";
                      if (!seasonGrouped[cat]) seasonGrouped[cat] = [];
                      seasonGrouped[cat].push(s);
                    }
                    const seasonOthers = seasonGrouped.other || [];
                    return (
                      <div className="player-modal-block">
                        <strong className="player-modal-label">
                          {data?.leagueName || "시즌"} {data?.season || ""} 스탯
                        </strong>
                        <div className="stat-groups">
                          {CAT_META.map(({ key, label, color }) => {
                            const items = seasonGrouped[key];
                            if (!items || items.length === 0) return null;
                            return (
                              <div className="stat-group" key={key}>
                                <div className="stat-group-head" style={{ "--cat-color": color }}>
                                  {label}
                                </div>
                                <div className="stat-item-grid">
                                  {items.map((s) => (
                                    <div className="stat-item" key={s.title}>
                                      <b className="si-val">{fmtVal(s.value)}</b>
                                      <span className="si-lbl">{krLabel(s.title)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {seasonOthers.length > 0 && (
                            <div className="stat-group">
                              <div className="stat-group-head" style={{ "--cat-color": "var(--muted)" }}>기타</div>
                              <div className="stat-item-grid">
                                {seasonOthers.map((s) => (
                                  <div className="stat-item" key={s.title}>
                                    <b className="si-val">{fmtVal(s.value)}</b>
                                    <span className="si-lbl">{krLabel(s.title)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                : stats.length > 0 && (
                    <button type="button" className="player-season-btn" onClick={() => setShowSeason(true)}>
                      시즌 기록 보기
                    </button>
                  )}

              {!isMatchMode && info.length === 0 && stats.length === 0 && (
                <StateMessage text="표시할 선수 정보가 없습니다" />
              )}
            </>
          )}
        </div>
        </div>{/* player-modal-scroll */}
      </div>
    </div>,
    document.body,
  );
}
