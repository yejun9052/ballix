// 접이식 패널 — 상세 페이지의 라인업/이벤트/AI 등 섹션 래퍼

export function CollapsiblePanel({ badge, children, className, collapsed, id, onToggle, title }) {
  return (
    <article className={`${className} collapsible-panel ${collapsed ? "is-collapsed" : ""}`}>
      <div className="panel-head compact collapsible-head">
        <div>
          <h2>{title}</h2>
          {badge && <span>{badge}</span>}
        </div>
        <button type="button" onClick={() => onToggle(id)}>
          {collapsed ? "펼치기" : "접기"}
        </button>
      </div>
      {!collapsed && <div className="collapsible-content">{children}</div>}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// 라인업 (실제 posX/posY 좌표 기반 피치 배치)
// ─────────────────────────────────────────────────────────────
// 선수별 골/어시스트/카드 집계.
// GOAL: fotmobPlayerId 일치=득점, detail(어시스트 제공자명)==이 선수 이름=어시스트
// CARD: detail "Yellow"/"Red"/"YellowRed"
