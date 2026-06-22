// 광고 배너 — 가로(X-n, 728×90) / 세로(H-n, 300×600)
import { useMemo } from "react";
import "../../styles/ad-banner.css";

// ── 광고 목록 ────────────────────────────────────────────────────
// 가로(728×90): X-1.png, X-2.png … 추가 시 아래 배열에 항목 추가
const HORIZONTAL_ADS = [
  // { src: "/ads/X-1.png", href: "#" },
];

// 세로(300×600): H-1.png, H-2.png … 추가 시 아래 배열에 항목 추가
const VERTICAL_ADS = [
  // { src: "/ads/H-1.png", href: "#" },
];
// ─────────────────────────────────────────────────────────────────

function pickRandom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// 세로 사이드바 광고 — 상세 페이지 양 옆 고정, 모바일 숨김
// 좌·우 각각 독립 랜덤
export function SidebarAds() {
  const left  = useMemo(() => pickRandom(VERTICAL_ADS), []);
  const right = useMemo(() => pickRandom(VERTICAL_ADS), []);

  if (!left && !right) return null;

  return (
    <>
      {left && (
        <a
          className="ad-sidebar ad-sidebar-left"
          href={left.href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label="광고"
        >
          <img src={left.src} alt="광고" />
          <span className="ad-label">AD</span>
        </a>
      )}
      {right && (
        <a
          className="ad-sidebar ad-sidebar-right"
          href={right.href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label="광고"
        >
          <img src={right.src} alt="광고" />
          <span className="ad-label">AD</span>
        </a>
      )}
    </>
  );
}

// 가로 배너 광고 — 슬롯마다 독립 랜덤, 광고 없으면 null
export function HorizontalAd({ gridArea }) {
  const ad = useMemo(() => pickRandom(HORIZONTAL_ADS), []);

  if (!ad) return null;

  return (
    <a
      className="ad-horizontal"
      style={gridArea ? { gridArea } : undefined}
      href={ad.href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label="광고"
    >
      <img src={ad.src} alt="광고" />
      <span className="ad-label">AD</span>
    </a>
  );
}
