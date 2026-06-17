// 관리자 - 공지 관리 탭 (작성/수정/삭제 + 예약 게시·만료, 상태 표시)
import { useEffect, useState } from "react";
import { createNotice, updateNotice, deleteNotice } from "../../api/admin.js";
import { getNotices } from "../../api/notice.js";
import { getPageContent, formatMatchDateTime } from "../../utils/format.js";
import { StateMessage } from "../common/StateMessage.jsx";

// 공지 상태 라벨/클래스 — 백엔드 status: SCHEDULED/ACTIVE/EXPIRED
const NOTICE_STATUS = {
  SCHEDULED: { label: "예정", cls: "scheduled" },
  ACTIVE: { label: "게시중", cls: "active" },
  EXPIRED: { label: "만료", cls: "expired" },
};

const EMPTY_FORM = { title: "", content: "", publishAt: "", expireAt: "" };

// datetime-local 입력값("2026-06-15T09:00")을 백엔드용으로 — 빈 값은 null
function toIso(local) {
  return local ? local : null;
}
// 백엔드 ISO("2026-06-15T09:00:00") → datetime-local 입력값("2026-06-15T09:00")
function toLocalInput(iso) {
  return iso ? iso.slice(0, 16) : "";
}

export function AdminNoticeTab() {
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function loadNotices() {
    setIsLoading(true);
    getNotices({ size: 100 })
      .then((data) => setNotices(getPageContent(data)))
      .catch((err) => setError(err.response?.data?.msg || "공지를 불러오지 못했습니다."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => { loadNotices(); }, []);

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError("");
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      publishAt: toIso(form.publishAt),
      expireAt: toIso(form.expireAt),
    };
    try {
      if (editing === "new") {
        await createNotice(payload);
      } else {
        await updateNotice(editing.id, payload);
      }
      setEditing(null);
      setForm(EMPTY_FORM);
      loadNotices();
    } catch (err) {
      setError(err.response?.data?.msg || "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setError("");
    try {
      await deleteNotice(id);
      loadNotices();
    } catch (err) {
      setError(err.response?.data?.msg || "삭제에 실패했습니다.");
    }
  }

  function startEdit(notice) {
    setEditing(notice);
    setForm({
      title: notice.title,
      content: notice.content,
      publishAt: toLocalInput(notice.publishAt),
      expireAt: toLocalInput(notice.expireAt),
    });
  }

  function startNew() {
    setEditing("new");
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  return (
    <div className="admin-section">
      {editing ? (
        <div className="notice-form">
          <h3>{editing === "new" ? "공지 작성" : "공지 수정"}</h3>
          <input
            className="notice-form-input"
            placeholder="제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            className="notice-form-textarea"
            placeholder="내용"
            rows={4}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <div className="notice-form-schedule">
            <label>
              <span>게시 시각 (비우면 즉시)</span>
              <input
                type="datetime-local"
                value={form.publishAt}
                onChange={(e) => setForm({ ...form, publishAt: e.target.value })}
              />
            </label>
            <label>
              <span>내림 시각 (비우면 무기한)</span>
              <input
                type="datetime-local"
                value={form.expireAt}
                onChange={(e) => setForm({ ...form, expireAt: e.target.value })}
              />
            </label>
          </div>
          {error && <p className="action-error">{error}</p>}
          <div className="notice-form-actions">
            <button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "저장 중" : "저장"}
            </button>
            <button type="button" className="secondary-btn" onClick={cancelEdit}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="new-notice-btn" onClick={startNew}>
          + 공지 작성
        </button>
      )}

      {isLoading && <StateMessage text="공지를 불러오는 중" />}
      {!isLoading && !editing && error && <p className="action-error">{error}</p>}
      {!isLoading && notices.length === 0 && !editing && (
        <StateMessage text="등록된 공지가 없습니다" />
      )}
      {!isLoading && notices.map((n) => {
        const st = NOTICE_STATUS[n.status] || NOTICE_STATUS.ACTIVE;
        return (
          <div key={n.id} className="notice-admin-row">
            <div className="notice-admin-header">
              <strong>
                <span className={`notice-status ${st.cls}`}>{st.label}</span>
                {n.title}
              </strong>
              <span className="notice-admin-date">{formatMatchDateTime(n.createAt)}</span>
            </div>
            <p className="notice-admin-content">{n.content}</p>
            <div className="notice-admin-meta">
              {n.authorName && <span>작성자 {n.authorName}</span>}
              {n.publishAt && <span>게시 {formatMatchDateTime(n.publishAt)}</span>}
              {n.expireAt && <span>내림 {formatMatchDateTime(n.expireAt)}</span>}
            </div>
            <div className="notice-row-actions">
              <button type="button" className="small-btn" onClick={() => startEdit(n)}>
                수정
              </button>
              <button
                type="button"
                className="small-btn danger-btn"
                onClick={() => handleDelete(n.id)}
              >
                삭제
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
