import API from "./index";

// 예측 저장/수정 — 로그인 필요. predictedWinner = HOME_TEAM | AWAY_TEAM | DRAW
export const predict = (matchId, predictedWinner) => {
  return API.post(
    `/api/prediction/predict?matchId=${matchId}&predictedWinner=${predictedWinner}`,
  );
};

// 내 예측 목록 — 로그인 필요
export const getMyPredictions = ({ page = 0, size = 100 } = {}) => {
  return API.get(`/api/prediction/myPrediction?page=${page}&size=${size}`);
};

// 특정 경기에 대한 내 예측 — 로그인 필요
// 예측 전이면 백엔드가 400/404로 응답(정상 흐름) → config로 토스트 억제 가능
export const getPredictionByMatch = (matchId, config) => {
  return API.get(`/api/prediction/findByMatch?matchId=${matchId}`, config);
};

// 예측 분포(%) — 본인이 예측한 경기만 조회 가능(예측 전이면 거절)
export const getPredictionRatio = (matchId, config) => {
  return API.get(`/api/prediction/ratio?matchId=${matchId}`, config);
};
