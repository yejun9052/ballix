import API from "./index";

// 경기 댓글 목록 (공개, 최신순, 페이지) — 응답은 Page 객체({content, totalElements, ...})
export const getComments = (matchId, { page = 0, size = 20 } = {}, config) =>
  API.get(`/api/match/${matchId}/comments?page=${page}&size=${size}`, config);

// 댓글 작성 (로그인 필요)
export const createComment = (matchId, content) =>
  API.post(`/api/match/${matchId}/comments`, { content });

// 댓글 삭제 (본인 또는 관리자)
export const deleteComment = (commentId) =>
  API.delete(`/api/comments/${commentId}`);
