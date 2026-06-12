import { FilePlus2, LayoutDashboard, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle.jsx";

export function AdminLayout() {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <NavLink to="/" className="brand admin-brand">
          <span className="brand-mark">B</span>
          <span>
            <strong>Ballix Admin</strong>
            <small>운영 콘솔</small>
          </span>
        </NavLink>

        <div className="admin-tools">
          <ThemeToggle />
        </div>

        <nav className="admin-nav" aria-label="관리자 메뉴">
          <NavLink to="/admin" end>
            <LayoutDashboard size={18} />
            대시보드
          </NavLink>
          <NavLink to="/admin/templates">
            <FilePlus2 size={18} />
            템플릿 관리
          </NavLink>
          <NavLink to="/admin/users">
            <Users size={18} />
            계정 관리
          </NavLink>
        </nav>
      </aside>

      <section className="admin-content">
        <Outlet />
      </section>
    </div>
  );
}
