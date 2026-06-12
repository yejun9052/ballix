import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme.js";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      title={isDark ? "라이트 모드" : "다크 모드"}
      aria-label={isDark ? "라이트 모드로 변경" : "다크 모드로 변경"}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
