// 유저 스쿼드(4-2-3-1) 조회/저장 — 로그인 필요
import API from "./index.js";

// 내 스쿼드 — { formation, slotKeys, slots: { "GK": card, ... } }
export const getSquad = () => API.get("/api/squad");

// 스쿼드 저장(통째 교체) — slots: { "GK": cardId, ... }
export const saveSquad = (slots) => API.put("/api/squad", { slots });
