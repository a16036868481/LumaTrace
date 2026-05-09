import { useEffect, useState } from "react";
import type { TranslationKey } from "../i18n/translations";

export type AppRoute = "dashboard" | "device" | "session" | "report" | "tools";

export interface NavItem {
  route: AppRoute;
  labelKey: TranslationKey;
  path: string;
}

export const navItems: NavItem[] = [
  { route: "dashboard", labelKey: "nav.dashboard", path: "/" },
  { route: "session", labelKey: "nav.session", path: "/session" },
  { route: "report", labelKey: "nav.report", path: "/report" },
  { route: "tools", labelKey: "nav.tools", path: "/tools" }
];

export function routeFromPath(pathname: string): AppRoute {
  if (pathname.startsWith("/devices")) {
    return "device";
  }
  if (pathname.startsWith("/session")) {
    return "session";
  }
  if (pathname.startsWith("/report")) {
    return "report";
  }
  if (pathname.startsWith("/tools")) {
    return "tools";
  }
  return "dashboard";
}

export function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function navigateTo(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useCurrentRoute(): AppRoute {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));

  useEffect(() => {
    const update = (): void => {
      setRoute(routeFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  return route;
}
