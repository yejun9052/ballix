import API from "./index";

// 공지 목록(게시 중만) — 공개. config로 토스트 억제 가능(배너 등 조용한 조회용)
export const getNotices = ({ page = 0, size = 8 } = {}, config) => {
  return API.get(`/api/notice?page=${page}&size=${size}`, config);
};

// 공지 단건 — 공개
export const getNotice = (id) => {
  return API.get(`/api/notice/${id}`);
};
