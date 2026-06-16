// 공지 배너 — 최신 공지를 메인 상단에 노출
import { useEffect, useState } from "react";
import { noticeApi } from "../../services/api.js";
import { getPageContent } from "../../utils/format.js";

export function NoticeBanner() {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    noticeApi
      .list({ size: 3 })
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
