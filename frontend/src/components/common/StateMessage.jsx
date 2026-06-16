// 상태 메시지 — 로딩·빈 목록·에러 안내 + 선택적 액션 버튼

export function StateMessage({ actionLabel, onAction, text }) {
  return (
    <div className="state-message">
      <strong>{text}</strong>
      {actionLabel && (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 리더보드 화면
// ─────────────────────────────────────────────────────────────
