import API from "./index";

// AI 승률 예측 생성 — force=true면 이미 예측된 경기도 재생성
export const predictAi = (matchId, { force = false } = {}) => {
  return API.post(`/api/admin/ai/predict?matchId=${matchId}&force=${force}`);
};

// 실시간 AI 승률 갱신(15분 간격) 상태 조회 — { enabled, intervalMinutes, liveTargets }
export const getLiveAi = () => {
  return API.get(`/api/admin/ai/live-prediction`);
};

// 실시간 AI 승률 갱신 on/off 토글
export const setLiveAi = (enabled) => {
  return API.post(`/api/admin/ai/live-prediction?enabled=${enabled}`);
};

// ── 유저 관리 ──

// 유저 목록 — q=이름 부분검색(선택)
export const getUsers = ({ q = "", page = 0, size = 8 } = {}) => {
  const params = new URLSearchParams({ page, size });
  if (q) params.set("q", q);
  return API.get(`/api/admin/users?${params.toString()}`);
};

export const changeUserRole = (userId, role) => {
  return API.put(`/api/admin/users/${userId}/role?role=${role}`);
};

// 계정 활성/정지 — message=정지 안내문(정지 시 선택)
export const changeUserStatus = (userId, active, message = "") => {
  const params = new URLSearchParams({ active });
  if (message) params.set("message", message);
  return API.put(`/api/admin/users/${userId}/status?${params.toString()}`);
};

// 보유 포인트 지급/조정 — amount 양수=지급, 음수=차감(카드뽑기에 쓰는 보유 포인트만 변경)
export const grantUserPoints = (userId, amount) => {
  return API.put(`/api/admin/users/${userId}/points?amount=${amount}`);
};

// ── 공지 관리 ──

// 전체 공지(SCHEDULED/ACTIVE/EXPIRED 포함)
export const getAdminNotices = ({ page = 0, size = 8 } = {}) => {
  return API.get(`/api/admin/notice?page=${page}&size=${size}`);
};

// publishAt/expireAt는 ISO 문자열(예약 게시/만료), null이면 즉시·무기한
export const createNotice = ({ title, content, publishAt = null, expireAt = null }) => {
  return API.post(`/api/admin/notice`, { title, content, publishAt, expireAt });
};

export const updateNotice = (id, { title, content, publishAt = null, expireAt = null }) => {
  return API.put(`/api/admin/notice/${id}`, { title, content, publishAt, expireAt });
};

export const deleteNotice = (id) => {
  return API.delete(`/api/admin/notice/${id}`);
};
