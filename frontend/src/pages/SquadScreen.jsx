// 스쿼드 화면 — 보유 카드로 4-2-3-1 스쿼드 구성 (골키퍼 자리엔 골키퍼만)
import { useEffect, useState } from "react";
import { getSquad, saveSquad } from "../api/squad.js";
import { getMyCards } from "../api/playerCard.js";
import { StateMessage } from "../components/common/StateMessage.jsx";
import "../styles/squad.css";

const GRADE_COLOR = {
  레전드: "#ff5ec4",
  월드클래스: "#a855f7",
  "탑 클래스": "#e0b341",
  프로: "#9aa4b2",
  세미프로: "#a97142",
  아마추어: "#6b7280",
};
const gradeColor = (g) => GRADE_COLOR[g] ?? "#888";

function isGk(pos) {
  if (!pos) return false;
  const p = pos.toLowerCase().trim();
  return p === "gk" || p.includes("keeper") || p.includes("goalkeeper");
}

// 선수 사진 — FotMob 이미지가 403/404로 깨지면 ⚽ 폴백(빈칸으로 보이는 것 방지).
function Photo({ url }) {
  const [bad, setBad] = useState(false);
  if (!url || bad) return <span className="photo-ball">⚽</span>;
  return <img src={url} alt="" loading="lazy" onError={() => setBad(true)} />;
}

// 4-2-3-1 슬롯 — 피치 좌표(%) + 표시 라벨. key는 백엔드 슬롯키와 일치해야 함.
const LAYOUT = [
  { key: "ST", label: "ST", x: 50, y: 13 },
  { key: "LW", label: "LW", x: 20, y: 31 },
  { key: "CAM", label: "CAM", x: 50, y: 34 },
  { key: "RW", label: "RW", x: 80, y: 31 },
  { key: "LCM", label: "CM", x: 34, y: 53 },
  { key: "RCM", label: "CM", x: 66, y: 53 },
  { key: "LB", label: "LB", x: 14, y: 71 },
  { key: "LCB", label: "CB", x: 38, y: 74 },
  { key: "RCB", label: "CB", x: 62, y: 74 },
  { key: "RB", label: "RB", x: 86, y: 71 },
  { key: "GK", label: "GK", x: 50, y: 90 },
];

export function SquadScreen({ user, isLoggedIn, onBack }) {
  const [assigned, setAssigned] = useState({}); // slotKey -> card
  const [cards, setCards] = useState([]); // 보유 카드
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(null); // 현재 고르는 슬롯키
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    Promise.all([getSquad(), getMyCards()])
      .then(([squad, my]) => {
        setAssigned(squad?.slots || {});
        setCards(my || []);
      })
      .catch((e) => setError(e.response?.data?.msg || "스쿼드를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  const usedIds = new Set(
    Object.values(assigned)
      .map((c) => c?.id)
      .filter(Boolean),
  );

  function assign(slotKey, card) {
    setAssigned((prev) => ({ ...prev, [slotKey]: card }));
    setPicker(null);
    setMsg("");
  }

  function clearSlot(slotKey, e) {
    e.stopPropagation();
    setAssigned((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
    setMsg("");
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const slots = {};
      for (const [k, c] of Object.entries(assigned)) if (c?.id) slots[k] = c.id;
      const res = await saveSquad(slots);
      setAssigned(res?.slots || {});
      setMsg("✅ 스쿼드 저장 완료");
    } catch (e) {
      setMsg(`❌ ${e.response?.data?.msg || "저장 실패"}`);
    } finally {
      setSaving(false);
    }
  }

  // 현재 슬롯에 넣을 수 있는 후보 — GK 슬롯이면 GK만, 아니면 비-GK. 이미 다른 칸에 쓴 카드는 제외.
  const pickerGk = picker === "GK";
  const candidates = cards
    .filter((c) => (pickerGk ? isGk(c.position) : !isGk(c.position)))
    .filter((c) => !usedIds.has(c.id) || assigned[picker]?.id === c.id)
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>스쿼드</strong>
          <span className="account-chip subtle">{user?.name || "게스트"}</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">SQUAD</span>
          <h1>나의 스쿼드 · 4-2-3-1</h1>
          <p>보유한 카드로 11명을 채워보세요. 골키퍼 자리엔 골키퍼만 들어갑니다.</p>
        </section>

        {!isLoggedIn ? (
          <StateMessage text="로그인이 필요합니다." />
        ) : loading ? (
          <StateMessage text="스쿼드를 불러오는 중" />
        ) : error ? (
          <StateMessage text={error} />
        ) : (
          <>
            <div className="squad-toolbar">
              <span className="squad-count">{Object.keys(assigned).length} / 11</span>
              {msg && <span className="squad-msg">{msg}</span>}
              <button type="button" className="squad-save" disabled={saving} onClick={handleSave}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>

            <div className="squad-pitch">
              {LAYOUT.map((slot) => {
                const card = assigned[slot.key];
                return (
                  <button
                    key={slot.key}
                    type="button"
                    className={`squad-slot ${card ? "filled" : "empty"}`}
                    style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    onClick={() => setPicker(slot.key)}
                  >
                    {card ? (
                      <>
                        <span
                          className="slot-x"
                          onClick={(e) => clearSlot(slot.key, e)}
                          aria-label="비우기"
                        >
                          ×
                        </span>
                        <span className="slot-photo" style={{ borderColor: gradeColor(card.grade) }}>
                          <Photo url={card.imageUrl} />
                          <span className="slot-ovr">{card.overall ?? "?"}</span>
                        </span>
                        <span className="slot-name">{card.playerName}</span>
                      </>
                    ) : (
                      <>
                        <span className="slot-plus">+</span>
                        <span className="slot-label">{slot.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {picker && (
        <div className="squad-picker-overlay" onClick={() => setPicker(null)}>
          <div className="squad-picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head">
              <strong>
                {pickerGk
                  ? "골키퍼 선택"
                  : `${LAYOUT.find((s) => s.key === picker)?.label ?? ""} 자리 선택`}
              </strong>
              <button type="button" onClick={() => setPicker(null)} aria-label="닫기">✕</button>
            </div>
            {candidates.length === 0 ? (
              <p className="picker-empty">
                {pickerGk ? "보유한 골키퍼 카드가 없습니다." : "넣을 수 있는 카드가 없습니다."}
              </p>
            ) : (
              <div className="picker-grid">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="picker-card"
                    style={{ borderColor: gradeColor(c.grade) }}
                    onClick={() => assign(picker, c)}
                  >
                    <span className="pc-ovr">{c.overall ?? "?"}</span>
                    <span className="pc-photo">
                      <Photo url={c.imageUrl} />
                    </span>
                    <span className="pc-name" title={c.playerName}>{c.playerName}</span>
                    <span className="pc-pos">{c.position || "-"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
