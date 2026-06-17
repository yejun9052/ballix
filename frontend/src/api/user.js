import API from "./index";

// 내 정보(전적·score·role) — 로그인 필요
export const getMe = () => {
  return API.get(`/api/user/me`);
};

// 닉네임 변경 — 로그인 필요
export const changeMyName = (name) => {
  return API.put(`/api/user/me/name?name=${encodeURIComponent(name)}`);
};

// 리더보드(포인트순) — 공개
export const getLeaderboard = ({ page = 0, size = 100 } = {}) => {
  return API.get(`/api/user/leaderboard?page=${page}&size=${size}`);
};
