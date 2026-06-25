import API from "./index";

// 내 정보(전적·score·role) — 로그인 필요.
// 비로그인 상태의 401은 "정상"(앱 부팅 시 로그인 여부 확인용)이라
// 기본적으로 에러 토스트를 끈다. SESSION_REPLACED는 인터셉터가 별도로 항상 알린다.
export const getMe = (config = {}) => {
  return API.get(`/api/user/me`, { skipErrorToast: true, ...config });
};

// 닉네임 변경 — 로그인 필요
export const changeMyName = (name) => {
  return API.put(`/api/user/me/name?name=${encodeURIComponent(name)}`);
};

// 리더보드(포인트순, 페이지네이션) — 공개. 응답은 Page 객체({content, totalPages, number, totalElements})
export const getLeaderboard = ({ page = 0, size = 10 } = {}) => {
  return API.get(`/api/user/leaderboard?page=${page}&size=${size}`);
};
