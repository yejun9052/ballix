import { BarChart3, LogIn, Shield, Trophy, User } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export function Layout() {
  const { user, switchRole } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">B</span>
          <span>
            <strong>Ballix</strong>
            <small>AI 승부예측</small>
          </span>
        </NavLink>

        <nav className="nav-links" aria-label="주요 메뉴">
          <NavLink to="/">
            <Trophy size={18} />
            예측
          </NavLink>
          <NavLink to="/mypage">
            <User size={18} />
            마이
          </NavLink>
          {user.role === "ADMIN" && (
            <NavLink to="/admin">
              <Shield size={18} />
              관리자
            </NavLink>
          )}
        </nav>

        <div className="top-actions">
          <button
            className="role-toggle"
            type="button"
            onClick={() => switchRole(user.role === "ADMIN" ? "USER" : "ADMIN")}
            title="개발 중 권한 전환"
          >
            <BarChart3 size={16} />
            {user.role}
          </button>
          <NavLink to="/login" className="login-link">
            <LogIn size={17} />
            로그인
          </NavLink>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
