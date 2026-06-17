// 좁은 화면(모바일) 여부를 감지하는 훅 — 라인업 세로 피치 전환에 사용
import { useEffect, useState } from "react";

export function useIsNarrow(maxWidth = 680) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (event) => setNarrow(event.matches);
    setNarrow(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return narrow;
}

