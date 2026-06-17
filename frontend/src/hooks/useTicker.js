// 1초 단위로 현재시각을 갱신하는 타이머 훅 (라이브 시계용)
import { useEffect, useState } from "react";

export function useTicker(active, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return now;
}

// 좁은 화면(모바일) 여부 — 라인업을 세로 피치로 전환하는 데 사용
