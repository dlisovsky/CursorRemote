import { useCallback, useEffect, useState } from "react";

export type AppRoute =
  | { page: "projects" }
  | { page: "agent"; agentId: string }
  | { page: "ide"; projectId: string; sessionId: string };

const DEFAULT_ROUTE: AppRoute = { page: "projects" };

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (!path) return DEFAULT_ROUTE;

  const agentMatch = path.match(/^agents\/([^/]+)$/);
  if (agentMatch) return { page: "agent", agentId: decodeURIComponent(agentMatch[1]!) };

  const ideMatch = path.match(/^ide\/([^/]+)\/([^/]+)$/);
  if (ideMatch) {
    return {
      page: "ide",
      projectId: decodeURIComponent(ideMatch[1]!),
      sessionId: decodeURIComponent(ideMatch[2]!),
    };
  }

  return DEFAULT_ROUTE;
}

export function routeToHash(route: AppRoute): string {
  switch (route.page) {
    case "projects":
      return "#/";
    case "agent":
      return `#/agents/${encodeURIComponent(route.agentId)}`;
    case "ide":
      return `#/ide/${encodeURIComponent(route.projectId)}/${encodeURIComponent(route.sessionId)}`;
  }
}

export function navigate(route: AppRoute): void {
  const next = routeToHash(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function useAppRoute(): [AppRoute, (route: AppRoute) => void] {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((next: AppRoute) => {
    navigate(next);
    setRoute(next);
  }, []);

  return [route, go];
}
