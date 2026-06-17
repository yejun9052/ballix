import API from "./index";

// 구글 OAuth 로그인 시작 — 페이지가 백엔드 인증 엔드포인트로 이동한다.
export const loginWithGoogle = () => {
  window.location.href = `${API.defaults.baseURL}/oauth2/authorization/google`;
};

export const logout = () => {
  return API.post(`/api/auth/logout`);
};
