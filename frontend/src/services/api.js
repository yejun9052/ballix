const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }

  if (!payload.success) {
    throw new Error(payload.msg || "요청에 실패했습니다.");
  }

  return payload.data;
}

export const authApi = {
  loginWithGoogle() {
    window.location.href = `${API_BASE_URL}/oauth2/authorization/google`;
  },
  logout() {
    return apiRequest("/api/auth/logout", { method: "POST" });
  },
};

export const userApi = {
  me() {
    return apiRequest("/api/user/me");
  },
  leaderboard({ page = 0, size = 100 } = {}) {
    return apiRequest(`/api/user/leaderboard?page=${page}&size=${size}`);
  },
};

export const matchApi = {
  getAllMatches({ page = 0, size = 100 } = {}) {
    return apiRequest(`/api/match/allMatch?page=${page}&size=${size}`);
  },
  getWorldCupMatches({ page = 0, size = 100 } = {}) {
    return apiRequest(`/api/match/findByCompId?id=6&page=${page}&size=${size}`);
  },
  getMatchesByDate(date, { page = 0, size = 100 } = {}) {
    return apiRequest(`/api/match/MatchDay?date=${date}&page=${page}&size=${size}`);
  },
  getFotmobView(matchId) {
    return apiRequest(`/api/match/${matchId}/fotmob`);
  },
  syncFotmob(matchId) {
    return apiRequest(`/api/match/${matchId}/fotmob/sync`, { method: "POST" });
  },
  getAiSummary(matchId) {
    return apiRequest(`/api/match/${matchId}/ai/summary`);
  },
};

export const predictionApi = {
  predict(matchId, predictedWinner) {
    return apiRequest(
      `/api/prediction/predict?matchId=${matchId}&predictedWinner=${predictedWinner}`,
      { method: "POST" },
    );
  },
  getMyPredictions({ page = 0, size = 100 } = {}) {
    return apiRequest(`/api/prediction/myPrediction?page=${page}&size=${size}`);
  },
  findByMatch(matchId) {
    return apiRequest(`/api/prediction/findByMatch?matchId=${matchId}`);
  },
  getRatio(matchId) {
    return apiRequest(`/api/prediction/ratio?matchId=${matchId}`);
  },
};

export const fotmobAdminApi = {
  syncSchedule({ pastDays = 7, futureDays = 14 } = {}) {
    return apiRequest(`/api/fotmob/schedule/sync?pastDays=${pastDays}&futureDays=${futureDays}`, { method: "POST" });
  },
  syncDate(yyyymmdd) {
    return apiRequest(`/api/fotmob/schedule/sync/${yyyymmdd}`, { method: "POST" });
  },
  syncMatch(matchId) {
    return apiRequest(`/api/match/${matchId}/fotmob/sync`, { method: "POST" });
  },
  syncStandings(competitionId) {
    return apiRequest(`/api/fotmob/standings/${competitionId}/sync`, { method: "POST" });
  },
  getPollInterval() {
    return apiRequest("/api/fotmob/poll-interval");
  },
  setPollInterval(minutes) {
    return apiRequest(`/api/fotmob/poll-interval?minutes=${minutes}`, { method: "POST" });
  },
  previewMatch(fotmobId) {
    return apiRequest(`/api/fotmob/preview/${fotmobId}`);
  },
  searchMatch({ team1 = "", team2 = "", competition = "" } = {}) {
    const params = new URLSearchParams();
    if (team1) params.set("team1", team1);
    if (team2) params.set("team2", team2);
    if (competition) params.set("competition", competition);
    return apiRequest(`/api/fotmob/search?${params.toString()}`);
  },
};

export const adminApi = {
  predictAi(matchId, { force = false } = {}) {
    return apiRequest(`/api/admin/ai/predict?matchId=${matchId}&force=${force}`, {
      method: "POST",
    });
  },
  listUsers({ page = 0, size = 8 } = {}) {
    return apiRequest(`/api/admin/users?page=${page}&size=${size}`);
  },
  changeUserRole(userId, role) {
    return apiRequest(`/api/admin/users/${userId}/role?role=${role}`, { method: "PUT" });
  },
  changeUserStatus(userId, active) {
    return apiRequest(`/api/admin/users/${userId}/status?active=${active}`, { method: "PUT" });
  },
  createNotice(title, content) {
    return apiRequest("/api/admin/notice", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    });
  },
  updateNotice(id, title, content) {
    return apiRequest(`/api/admin/notice/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content }),
    });
  },
  deleteNotice(id) {
    return apiRequest(`/api/admin/notice/${id}`, { method: "DELETE" });
  },
};

export const noticeApi = {
  list({ page = 0, size = 8 } = {}) {
    return apiRequest(`/api/notice?page=${page}&size=${size}`);
  },
  get(id) {
    return apiRequest(`/api/notice/${id}`);
  },
};

export const standingsApi = {
  getStandings(competitionId, { page = 0, size = 100 } = {}) {
    return apiRequest(`/api/fotmob/standings/${competitionId}?page=${page}&size=${size}`);
  },
};
