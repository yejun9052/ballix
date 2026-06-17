// 선수 모달.
// - 경기에서 클릭(matchPlayer 있음): "이 경기" 스탯 + 기본 프로필(키·몸무게·주발 등)을 표시.
//   기본 프로필은 경기 크롤엔 없어 선수 상세 API(getPlayerSeason)의 info에서 가져온다(lazy-cache).
//   시즌 스탯(stats)은 "시즌 기록 보기"를 눌러야 펼쳐진다(이미 받아둔 데이터라 추가 요청 없음).
// - 경기 맥락 없이 열면(matchPlayer 없음): 프로필 + 시즌 스탯을 바로 표시.
// #root에 filter가 걸려 position:fixed가 viewport 기준이 안 되므로 createPortal로 body에 렌더(중앙 고정).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getPlayerSeason } from "../../api/match.js";
import { krLabel, krValue } from "../../utils/playerLabels.js";
import { collectPlayerMarks } from "../../utils/lineup.js";
import { PlayerPhoto } from "./PlayerPhoto.jsx";
import { StateMessage } from "./StateMessage.jsx";

export function PlayerModal({ playerId, fallbackName, matchPlayer, matchTeamName, events = [], onClose }) {
  const isMatchMode = !!matchPlayer;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 시즌 스탯 그리드 펼침 여부 — 경기 모드는 버튼으로, 일반 조회는 항상 펼침.
  const [showSeason, setShowSeason] = useState(!isMatchMode);

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 선수 상세(프로필 info + 시즌 stats) 로드 — 두 모드 모두 기본 프로필을 위해 가져온다(lazy-cache).
  useEffect(() => {
    if (!playerId) {
      return undefined;
    }
    let mounted = true;
    setLoading(true);
    setError("");
    getPlayerSeason(playerId)
      .then((res) => mounted && setData(res))
      .catch((e) => mounted && setError(e.response?.data?.msg || "선수 정보를 불러오지 못했습니다."))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [playerId]);

  const info = data?.info || [];
  const stats = data?.stats || [];
  const name = data?.name || matchPlayer?.name || fallbackName || "선수";
  const teamName = isMatchMode ? matchTeamName : data?.teamName;
  const positionLabel = isMatchMode ? matchPlayer?.position : data?.position;

  // 이 경기(라인업) 스탯 — 매 폴링 갱신되는 경기별 데이터.
  // FotMob 경기별 상세(슈팅·기회 창출·터치·패스·태클 등)를 우선 표시하고,
  // 거기에 없는 이벤트 기반(골/도움/카드)·교체·포지션을 덧붙인다(라벨 중복 제거).
  const marks = matchPlayer ? collectPlayerMarks(events, matchPlayer) : null;
  const detailed = (matchPlayer?.matchStats || []).map((s) => ({ label: krLabel(s.title), value: s.value }));
  const curated = matchPlayer
    ? [
        !detailed.length && Number.isFinite(matchPlayer.rating) ? { label: "평점", value: matchPlayer.rating } : null,
        marks?.goals ? { label: "골", value: marks.goals } : null,
        marks?.assists ? { label: "도움", value: marks.assists } : null,
        marks?.yellow ? { label: "경고", value: marks.yellow } : null,
        marks?.red ? { label: "퇴장", value: marks.red } : null,
        Number.isFinite(matchPlayer.subInMinute) ? { label: "교체 투입", value: `${matchPlayer.subInMinute}'` } : null,
        Number.isFinite(matchPlayer.subOutMinute) ? { label: "교체 아웃", value: `${matchPlayer.subOutMinute}'` } : null,
        matchPlayer.position ? { label: "포지션", value: matchPlayer.position } : null,
      ].filter(Boolean)
    : [];
  const matchStats = (() => {
    const seen = new Set();
    return [...detailed, ...curated].filter((s) => {
      if (s.value == null || s.value === "" || seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  })();

  // 기본 프로필(키·몸무게·주발·나이·국적·시장가치 등) — 선수 상세 info
  const profileBlock = info.length > 0 && (
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
  );

  // 시즌 스탯 그리드
  const seasonStatsBlock = stats.length > 0 && (
    <div className="player-modal-block">
      <strong className="player-modal-label">
        {data?.leagueName || "시즌"} {data?.season || ""} 스탯
      </strong>
      <div className="player-stat-grid">
        {stats.map((s) => (
          <div className="player-stat-item" key={s.title}>
            <b className="ps-value">{String(s.value)}</b>
            <span className="ps-title">{krLabel(s.title)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card player-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="player-modal-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>

        <div className="player-modal-head">
          <PlayerPhoto id={playerId} name={name} />
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
          {/* 경기 모드: 이 경기 스탯 (라인업 데이터라 즉시 표시) */}
          {isMatchMode && (
            <div className="player-modal-block">
              <strong className="player-modal-label">이 경기</strong>
              {matchStats.length > 0 ? (
                <div className="player-stat-grid">
                  {matchStats.map((s) => (
                    <div className="player-stat-item" key={s.label}>
                      <b className="ps-value">{String(s.value)}</b>
                      <span className="ps-title">{s.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <StateMessage text="이 경기 기록이 아직 없습니다" />
              )}
            </div>
          )}

          {/* 기본 프로필(키·몸무게·주발 등) — 상세 로딩 상태 표시 */}
          {loading ? (
            <StateMessage text="선수 정보를 불러오는 중" />
          ) : error ? (
            <StateMessage text={error} />
          ) : (
            <>
              {profileBlock}

              {/* 시즌 스탯: 경기 모드는 버튼으로 펼침, 일반 조회는 바로 표시 */}
              {showSeason
                ? seasonStatsBlock
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
      </div>
    </div>,
    document.body,
  );
}
