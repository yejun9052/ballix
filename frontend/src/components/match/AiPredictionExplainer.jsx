// AI 승률 예측 산출 방식 설명 — 접고 펼 수 있는(collapsible) 박스
// 포트폴리오용: 어떤 데이터를 어떻게 모아 승률을 계산하는지 보여준다.
import { useState } from "react";
import "../../styles/ai-explainer.css";

export function AiPredictionExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <div className={`ai-explainer ${open ? "open" : ""}`}>
      {/* 헤더(토글 버튼) — 클릭 시 본문 펼침/접힘 */}
      <button
        type="button"
        className="ai-explainer-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="ai-explainer-title">🤖 AI 승률은 어떻게 계산되나요?</span>
        <span className="ai-explainer-caret" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {/* 본문 — 펼쳤을 때만 표시 */}
      {open && (
        <div className="ai-explainer-body">
          {/* 1) 입력 데이터 */}
          <div className="ai-explainer-step">
            <span className="ai-explainer-num">1</span>
            <div>
              <strong>데이터 수집</strong>
              <p>FIFA 랭킹(보조 지표), 리그·조별 순위, 양 팀의 최근 경기 폼을 모읍니다. 모두 DB에 쌓인 데이터라 추가 크롤링 없이 즉시 사용합니다.</p>
            </div>
          </div>

          {/* 2) AI 분석 */}
          <div className="ai-explainer-step">
            <span className="ai-explainer-num">2</span>
            <div>
              <strong>AI 분석</strong>
              <p>모은 지표를 요약해 Google Gemini에 전달하고, 구조화된 JSON으로 홈 승·무·원정 승 확률과 예상 스코어를 받습니다.</p>
            </div>
          </div>

          {/* 3) 정규화 */}
          <div className="ai-explainer-step">
            <span className="ai-explainer-num">3</span>
            <div>
              <strong>정규화</strong>
              <p>세 확률의 합이 정확히 100%가 되도록 1% 단위로 보정하고, 예상 스코어가 확률과 어긋나면 방향을 맞춥니다.</p>
            </div>
          </div>

          {/* 4) 실시간 갱신 */}
          <div className="ai-explainer-step">
            <span className="ai-explainer-num">4</span>
            <div>
              <strong>실시간 갱신</strong>
              <p>경기가 진행되면 현재 스코어와 경과 시간을 다시 반영해 약 15분 간격(전·후반)으로 남은 결과 확률을 재계산합니다.</p>
            </div>
          </div>

          <p className="ai-explainer-note">
            ※ 참고용 예측이며 실제 결과를 보장하지 않습니다.
          </p>
        </div>
      )}
    </div>
  );
}
