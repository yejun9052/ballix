// 관리자 - 유저 관리 탭 (권한/계정상태 변경, 보유 포인트 지급, 페이지네이션)
import { useEffect, useState } from "react";
import { getUsers, changeUserRole, changeUserStatus, grantUserPoints } from "../../api/admin.js";
import { getPageContent } from "../../utils/format.js";
import { StateMessage } from "../common/StateMessage.jsx";

export function AdminUsersTab({ user }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pointDraft, setPointDraft] = useState({});   // { [userId]: 입력값 }
  const [busyId, setBusyId] = useState(null);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");
    getUsers({ page, size: 8 })
      .then((data) => {
        if (!mounted) return;
        if (data?.content) {
          setUsers(data.content);
          setTotalPages(data.totalPages ?? 1);
        } else {
          setUsers(getPageContent(data));
        }
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.msg || "유저 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, [page, refreshKey]);

  async function handleRoleChange(u) {
    setError("");
    try {
      await changeUserRole(u.id, u.role === "ADMIN_USER" ? "COMMON_USER" : "ADMIN_USER");
      refresh();
    } catch (err) {
      setError(err.response?.data?.msg || "권한 변경에 실패했습니다.");
    }
  }

  async function handleStatusChange(u) {
    setError("");
    try {
      await changeUserStatus(u.id, !u.active);
      refresh();
    } catch (err) {
      setError(err.response?.data?.msg || "계정 상태 변경에 실패했습니다.");
    }
  }

  // 보유 포인트 지급/조정 — 양수=지급, 음수=차감(누적 랭킹 점수는 안 바뀜)
  async function handleGrantPoints(u) {
    const raw = (pointDraft[u.id] ?? "").trim();
    const amount = Number(raw);
    if (!raw || !Number.isInteger(amount) || amount === 0) {
      setError("지급할 포인트(0이 아닌 정수)를 입력하세요.");
      return;
    }
    setError("");
    setBusyId(u.id);
    try {
      await grantUserPoints(u.id, amount);
      setPointDraft((d) => ({ ...d, [u.id]: "" }));
      refresh();
    } catch (err) {
      setError(err.response?.data?.msg || "포인트 지급에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-section">
      {error && <p className="action-error">{error}</p>}
      {isLoading && <StateMessage text="유저 목록을 불러오는 중" />}
      {!isLoading && users.length === 0 && !error && (
        <StateMessage text="유저가 없습니다" />
      )}
      {!isLoading && users.map((u) => {
        const isMe = user?.id === u.id;
        return (
          <div
            key={u.id}
            className={`user-admin-row ${!u.active ? "is-banned" : ""} ${isMe ? "is-me" : ""}`}
          >
            <div className="user-admin-info">
              <strong>{u.name}</strong>
              {isMe && <em className="me-tag">나</em>}
              <span className="user-admin-email">{u.email}</span>
              <span className="user-admin-stats">
                {u.matchesPlayed}경기 · {u.correctCount}적중 · 보유 {(u.pointBalance ?? 0).toLocaleString()}P
              </span>
            </div>
            <div className="user-admin-badges">
              <span className={u.role === "ADMIN_USER" ? "admin-badge" : "role-chip"}>
                {u.role === "ADMIN_USER" ? "관리자" : "일반"}
              </span>
              <span className={u.active ? "active-chip" : "banned-chip"}>
                {u.active ? "활성" : "정지"}
              </span>
            </div>
            <div className="user-admin-actions">
              {!isMe ? (
                <>
                  <button
                    type="button"
                    className="small-btn"
                    onClick={() => handleRoleChange(u)}
                  >
                    {u.role === "ADMIN_USER" ? "일반으로" : "관리자로"}
                  </button>
                  <button
                    type="button"
                    className={`small-btn ${u.active ? "danger-btn" : ""}`}
                    onClick={() => handleStatusChange(u)}
                  >
                    {u.active ? "정지" : "활성화"}
                  </button>
                </>
              ) : (
                <span className="self-note">본인 계정</span>
              )}
              <div className="point-grant">
                <input
                  type="number"
                  className="point-grant-input"
                  placeholder="포인트"
                  value={pointDraft[u.id] ?? ""}
                  onChange={(e) => setPointDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleGrantPoints(u); }}
                />
                <button
                  type="button"
                  className="small-btn point-grant-btn"
                  disabled={busyId === u.id}
                  onClick={() => handleGrantPoints(u)}
                >
                  {busyId === u.id ? "지급 중…" : "지급"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {totalPages > 1 && (
        <div className="pager">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>◀</button>
          <span>{page + 1} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>▶</button>
        </div>
      )}
    </div>
  );
}

