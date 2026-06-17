// 공지 배너 — 최신 공지를 메인 상단에 노출
import { useEffect, useState } from "react";
import { getNotices } from "../../api/notice.js";
import { getPageContent } from "../../utils/format.js";

export function NoticeBanner() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    // 배너는 실패해도 조용히 숨기므로 전역 토스트를 끈다.
    getNotices({ size: 3 }, { skipErrorToast: true })
      .then((data) => setNotices(getPageContent(data)))
      .catch(() => {});
  }, []);

  if (notices.length === 0) return null;

  return (
    <div className="notice-banner">
      {notices.map((n) => (
        <div key={n.id} className="notice-banner-item">
          <span className="notice-badge">📢</span>
          <span className="notice-banner-title">{n.title}</span>
          <span className="notice-banner-content">{n.content}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 리그 순위 화면
// ─────────────────────────────────────────────────────────────
