import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import AuthContext from "./AuthContextValue.js";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/auth/session")
      .then(({ data }) => {
        sessionStorage.setItem("ellie-csrf-token", data.csrfToken);
        setSession(data);
      })
      .catch(() => {
        sessionStorage.removeItem("ellie-csrf-token");
        sessionStorage.removeItem("ellie-session-token");
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    session,
    loading,
    async login(email, password) {
      const { data } = await api.post("/auth/login", { email, password });
      const { sessionToken, ...sessionData } = data;
      sessionStorage.setItem("ellie-csrf-token", sessionData.csrfToken);
      sessionStorage.setItem("ellie-session-token", sessionToken);
      setSession(sessionData);
      return sessionData;
    },
    async logout() {
      try {
        await api.post("/auth/logout");
      } finally {
        sessionStorage.removeItem("ellie-csrf-token");
        sessionStorage.removeItem("ellie-session-token");
        setSession(null);
      }
    },
    updateSessionUser(user) { setSession((current) => current ? { ...current, user: { ...current.user, ...user } } : current); },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
