import { useMemo, useState } from "react";

const MOCK_USER_KEY = "ballix.mockUserRole";

export function useAuth() {
  const [role, setRole] = useState(
    () => localStorage.getItem(MOCK_USER_KEY) || "USER",
  );

  const user = useMemo(
    () => ({
      id: "mock-user",
      name: role === "ADMIN" ? "관리자" : "김윤의",
      email: role === "ADMIN" ? "admin@ballix.dev" : "user@ballix.dev",
      role,
    }),
    [role],
  );

  function switchRole(nextRole) {
    localStorage.setItem(MOCK_USER_KEY, nextRole);
    setRole(nextRole);
  }

  return { user, switchRole };
}
