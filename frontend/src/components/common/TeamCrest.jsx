// 팀 엠블럼(크레스트) — 이미지 없으면 첫 글자 표시
import { memo } from "react";

export const TeamCrest = memo(function TeamCrest({ crest, name, size = "small" }) {
  const sizeClass = size === "large" ? "large" : size === "flag" ? "flag-crest" : "mini-crest";

  return (
    <div className={`team-crest ${sizeClass}`}>
      {crest ? <img alt={`${name} 엠블럼`} src={crest} /> : <span>{name.slice(0, 1)}</span>}
    </div>
  );
});
