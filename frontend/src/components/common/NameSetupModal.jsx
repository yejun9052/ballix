// 첫 로그인 닉네임 설정 모달 — 이름을 등록해야 닫힌다(필수)
import { useState } from "react";
import { userApi } from "../../services/api.js";

export function NameSetupModal({ user, onComplete }) {
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const next = name.trim();
    if (!next) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await userApi.changeName(next);
      onComplete?.(next);
    } catch (e) {
      setError(e.message || "저장에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <span className="brand-pill">WELCOME</span>
        <h2>닉네임을 정해주세요</h2>
        <p>리더보드와 예측에 표시될 이름입니다. 나중에 마이페이지에서 바꿀 수 있어요.</p>
        <input
          className="data-input"
          value={name}
          maxLength={20}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="닉네임 (최대 20자)"
        />
        {error && <p className="action-error">{error}</p>}
        <button type="button" className="modal-submit" onClick={handleSubmit} disabled={busy}>
          {busy ? "저장 중…" : "시작하기"}
        </button>
      </div>
    </div>
  );
}
