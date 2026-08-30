import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchPublicSite } from "../services/api.js";
import WorkspaceThemeContext from "./WorkspaceThemeContextValue.js";
export function WorkspaceThemeProvider({ children }) {
  const { pathname } = useLocation();
  const [site, setSite] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        fetchPublicSite()
          .then(setSite)
          .catch(() => setSite(null))
          .finally(() => setLoading(false)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const b = site?.branding;
    if (!b) return;
    const root = document.documentElement;
    root.style.setProperty("--workspace-primary", b.primaryColor);
    root.style.setProperty("--workspace-accent", b.accentColor);
    root.style.setProperty(
      "--workspace-background",
      b.surfaceMode === "light" ? "#f7f8f7" : "#090b0a",
    );
    root.style.setProperty(
      "--workspace-surface",
      b.surfaceMode === "light" ? "#ffffff" : "#151816",
    );
    root.style.setProperty(
      "--workspace-text",
      b.surfaceMode === "light" ? "#111512" : "#f7f8f7",
    );
    root.style.setProperty(
      "--workspace-muted",
      b.surfaceMode === "light" ? "#667069" : "#a5afa8",
    );
    root.style.setProperty(
      "--workspace-border",
      b.surfaceMode === "light" ? "#dce2de" : "#2a302c",
    );
    const app = site?.appBranding;
    if (app) {
      root.style.setProperty("--app-sidebar-background", app.sidebarBackgroundColor);
      root.style.setProperty("--app-sidebar-text", app.sidebarTextColor);
      root.style.setProperty("--app-header", app.headerColor);
      root.style.setProperty("--app-primary-action", app.primaryActionColor);
      root.style.setProperty("--app-accent", app.accentColor);
      root.style.setProperty("--app-background", app.backgroundColor);
    }
    const publicRoute = /^\/(?:$|about(?:\/|$)|coaching-programs(?:\/|$)|testimonials(?:\/|$)|contact(?:\/|$)|people(?:\/|$)|privacy(?:-policy)?(?:\/|$)|terms(?:\/|$)|data-deletion(?:\/|$)|apply(?:\/|$)|ref(?:\/|$)|profile\/edit(?:\/|$))/.test(pathname);
    const favicon = publicRoute ? b.faviconUrl : app?.faviconUrl || b.faviconUrl;
    const variant = (url, size) => url?.includes("res.cloudinary.com/") && url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/c_fill,w_${size},h_${size},f_png/`) : url;
    document.querySelectorAll("link[data-workspace-favicon]").forEach((node) => node.remove());
    if (favicon) {
      const fallbackIcon = document.querySelector("link[rel='icon']:not([data-workspace-favicon])");
      if (fallbackIcon) fallbackIcon.href = variant(favicon, 32);
      [["icon",16],["icon",32],["icon",48],["icon",192],["icon",512],["apple-touch-icon",180]].forEach(([rel,size]) => {
        const link = document.createElement("link");
        link.rel = rel;
        link.href = variant(favicon, size);
        link.sizes = `${size}x${size}`;
        link.type = "image/png";
        link.dataset.workspaceFavicon = "true";
        document.head.appendChild(link);
      });
    }
  }, [site, pathname]);
  const value = useMemo(() => ({ site, loading }), [site, loading]);
  return (
    <WorkspaceThemeContext.Provider value={value}>
      {children}
    </WorkspaceThemeContext.Provider>
  );
}
