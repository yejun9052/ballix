// 관리자 화면 — 공지/유저/데이터 탭 컨테이너
import { useState } from "react";
import { AdminNoticeTab } from "../components/admin/AdminNoticeTab.jsx";
import { AdminUsersTab } from "../components/admin/AdminUsersTab.jsx";
import { AdminDataTab } from "../components/admin/AdminDataTab.jsx";

export function AdminScreen({ onBack, user }) {
  const [tab, setTab] = useState("notice");

  return (
    <main className="board-shell">
      <section className="board-screen">
        <header className="detail-topbar">
          <button type="button" onClick={onBack}>← 메인으로</button>
          <strong>관리자 패널</strong>
          <span className="admin-badge">관리자</span>
        </header>

        <section className="detail-hero compact-hero">
          <span className="brand-pill">ADMIN</span>
          <h1>관리자 패널</h1>
          <p>공지사항 · 유저 관리 · 데이터 동기화</p>
        </section>

        <div className="admin-tabs">
          <button
            type="button"
            className={tab === "notice" ? "active" : ""}
            onClick={() => setTab("notice")}
          >
            📢 공지사항
          </button>
          <button
            type="button"
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            👥 유저 관리
          </button>
          <button
            type="button"
            className={tab === "data" ? "active" : ""}
            onClick={() => setTab("data")}
          >
            🔄 데이터 관리
          </button>
        </div>

        {tab === "notice" && <AdminNoticeTab />}
        {tab === "users" && <AdminUsersTab user={user} />}
        {tab === "data" && <AdminDataTab />}
      </section>
    </main>
  );
}

