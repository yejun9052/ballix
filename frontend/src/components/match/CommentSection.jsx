// 경기 댓글 — 조회는 공개, 작성은 로그인 필요, 삭제는 본인 또는 관리자
import { useEffect, useState } from "react";
import { getComments, createComment, deleteComment } from "../../api/comment.js";
import { StateMessage } from "../common/StateMessage.jsx";

const MAX_LENGTH = 500;

function formatTime(iso) {
  if (!iso) return "";
  return String(iso).replace("T", " ").slice(0, 16);
}

export function CommentSection({ matchId, isLoggedIn, isAdmin, onLogin }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!matchId) {
      return undefined;
    }
    let mounted = true;
    setLoading(true);
    setLoadError("");
    getComments(matchId)
      .then((page) => {
        if (mounted) setComments(page?.content || []);
      })
      .catch(() => {
        if (mounted) setLoadError("댓글을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [matchId]);

  async function handleSubmit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const created = await createComment(matchId, body);
      setComments((prev) => [created, ...prev]); // 최신순이라 맨 앞에
      setDraft("");
    } catch {
      // 실패 메시지는 API 인터셉터가 토스트로 표시
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("댓글을 삭제할까요?")) {
      return;
    }
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // 인터셉터 토스트
    }
  }

  return (
    <div className="comment-section">
      {isLoggedIn ? (
        <form className="comment-form-wrap" onSubmit={handleSubmit}>
          <div className="comment-form">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="이 경기에 대한 댓글을 남겨보세요"
              rows={2}
            />
            <button type="submit" disabled={submitting || !draft.trim()}>
              {submitting ? "등록 중" : "등록"}
            </button>
          </div>
          <div className="comment-form-foot">
            <span>{draft.length}/{MAX_LENGTH}</span>
          </div>
        </form>
      ) : (
        <div className="comment-login-hint">
          댓글은 로그인 후 작성할 수 있어요.{" "}
          <button type="button" className="account-chip-btn" onClick={onLogin}>로그인</button>
        </div>
      )}

      {loading ? (
        <StateMessage text="댓글을 불러오는 중" />
      ) : loadError ? (
        <p className="action-error">{loadError}</p>
      ) : comments.length === 0 ? (
        <p className="comment-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li className="comment-item" key={c.id}>
              <div className="comment-item-head">
                <span className="author">{c.authorName || "사용자"}</span>
                {c.mine && <span className="me-tag">나</span>}
                <span className="time">{formatTime(c.createAt)}</span>
                {(c.mine || isAdmin) && (
                  <button type="button" className="comment-del" onClick={() => handleDelete(c.id)}>
                    삭제
                  </button>
                )}
              </div>
              <div className="comment-item-body">{c.content}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
