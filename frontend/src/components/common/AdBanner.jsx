// 광고 배너 — 세로(상세 페이지 좌우 사이드바 고정) / 가로(메인 페이지 인라인)
import { useMemo } from "react";
import "../../styles/ad-banner.css";

const VERTICAL_ADS = [
  { id: "lifechart-v", src: "/ads/lifechart-v.png", alt: "LifeChart — 할 일 기록·채팅·라이프 차트", href: "#" },
  { id: "comchin-v",   src: "/ads/comchin-v.png",   alt: "컴친 PC — 신규 조립 회원모집 70% 할인", href: "#" },
];

const HORIZONTAL_ADS = [
  { id: "lifechart-h", src: "/ads/lifechart-h.png", alt: "LifeChart — 신규가입 첫 30일 무료", href: "#" },
  { id: "comchin-h",   src: "/ads/comchin-h.png",   alt: "컴친 PC — 신규 조립 회원모집", href: "#" },
];

// 세로 사이드바 광고 — 상세 페이지 좌우에 fixed 위치, 모바일 숨김
export function SidebarAds() {
  const ad = useMemo(
    () => VERTICAL_ADS[Math.floor(Math.random() * VERTICAL_ADS.length)],
    [],
  );
  return (
    <>
      <a
        className="ad-sidebar ad-sidebar-left"
        href={ad.href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={ad.alt}
      >
        <img src={ad.src} alt={ad.alt} />
        <span className="ad-label">AD</span>
      </a>
      <a
        className="ad-sidebar ad-sidebar-right"
        href={ad.href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={ad.alt}
      >
        <img src={ad.src} alt={ad.alt} />
        <span className="ad-label">AD</span>
      </a>
    </>
  );
}

// 가로 배너 광고 — 메인 페이지 인라인 배치
export function HorizontalAd({ slot = 0 }) {
  const ad = HORIZONTAL_ADS[slot % HORIZONTAL_ADS.length];
  return (
    <a
      className="ad-horizontal"
      href={ad.href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label={ad.alt}
    >
      <img src={ad.src} alt={ad.alt} />
      <span className="ad-label">AD</span>
    </a>
  );
}
