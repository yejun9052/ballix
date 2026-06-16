// 관리자 - 공지 관리 탭 (작성/수정/삭제)
import { useEffect, useState } from "react";
import { adminApi, noticeApi } from "../../services/api.js";
import { getPageContent, formatMatchDateTime } from "../../utils/format.js";
import { StateMessage } from "../common/StateMessage.jsx";

export function AdminNoticeTab() {
  const [notices, setNotices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function loadNotices() {
    setIsLoading(true);
    noticeApi
      .list({ size: 100 })
      .then((data) => setNotices(getPageContent(data)))
      .catch((err) => setError(err.message || "공지를 불러오지 못했습니다."))
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
    try {
      if (editing === "new") {
        await adminApi.createNotice(form.title.trim(), form.content.trim());
      } else {
        await adminApi.updateNotice(editing.id, form.title.trim(), form.content.trim());
      }
      setEditing(null);
      setForm({ title: "", content: "" });
      loadNotices();
    } catch (err) {
      setError(err.message || "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setError("");
    try {
      await adminApi.deleteNotice(id);
      loadNotices();
    } catch (err) {
      setError(err.message || "삭제에 실패했습니다.");
    }
  }

  function startEdit(notice) {
    setEditing(notice);
    setForm({ title: notice.title, content: notice.content });
  }

  function startNew() {
    setEditing("new");
    setForm({ title: "", content: "" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm({ title: "", content: "" });
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
      {!isLoading && notices.map((n) => (
        <div key={n.id} className="notice-admin-row">
          <div className="notice-admin-header">
            <strong>{n.title}</strong>
            <span className="notice-admin-date">{formatMatchDateTime(n.createAt)}</span>
          </div>
          <p className="notice-admin-content">{n.content}</p>
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
      ))}
    </div>
  );
}

