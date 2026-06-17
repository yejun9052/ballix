// 마이페이지 — 내 전적, 닉네임 변경, 로그아웃
import { useState } from "react";
import { userApi } from "../services/api.js";

export function MyPageScreen({ user, onBack, onLogout, onUserUpdate }) {
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const isAdmin = user?.role === "ADMIN_USER";

  async function handleSaveName() {
    const next = name.trim();
    if (!next) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (next === user?.name) {
      setError("");
      setMsg("변경할 내용이 없습니다.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await userApi.changeName(next);
      onUserUpdate?.(next);
      setMsg("닉네임이 변경되었습니다.");
    } catch (e) {
      setError(e.message || "변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>마이페이지</strong>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">MY PAGE</span>
          <h1>{user?.name || "사용자"}</h1>
          <p>{isAdmin ? "관리자 계정" : "일반 계정"}</p>
        </section>

        <section className="detail-panel mypage-panel">
          {/* 전적 */}
          <div className="mypage-stats">
            <div><span>포인트</span><strong>{user?.score ?? 0}</strong></div>
            <div><span>참여</span><strong>{user?.matchesPlayed ?? 0}</strong></div>
            <div><span>적중</span><strong>{user?.correctCount ?? 0}</strong></div>
            <div><span>적중률</span><strong>{user?.accuracy ?? 0}%</strong></div>
          </div>

          {/* 닉네임 변경 */}
          <div className="mypage-section">
            <h3>닉네임 변경</h3>
            <div className="mypage-name-row">
              <input
                className="data-input"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="닉네임 (최대 20자)"
              />
              <button type="button" className="data-btn" onClick={handleSaveName} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
            {msg && <p className="mypage-msg">{msg}</p>}
            {error && <p className="action-error">{error}</p>}
          </div>

          {/* 로그아웃 */}
          <div className="mypage-section">
            <button type="button" className="mypage-logout" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
