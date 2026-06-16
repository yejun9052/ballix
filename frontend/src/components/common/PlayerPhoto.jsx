// 선수 사진 — FotMob 이미지, 로드 실패 시 첫 글자 폴백
import { memo, useState } from "react";

export const PlayerPhoto = memo(function PlayerPhoto({ id, name, small = false }) {
  const [failed, setFailed] = useState(false);
  const src = id
    ? `https://images.fotmob.com/image_resources/playerimages/${id}.png`
    : "";
  const className = `player-photo ${small ? "small" : ""}`;

  if (!src || failed) {
    return <div className={className}>{(name || "?").slice(0, 1)}</div>;
  }

  return (
    <div className={`${className} has-img`}>
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
});
