import { useLocation } from "react-router-dom";

export type DetailNavigationState = {
  from?: string;
};

export function isSafeAppPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !path.includes("://")
  );
}

export function currentAppPath(location: {
  pathname: string;
  search?: string;
}) {
  return `${location.pathname}${location.search ?? ""}`;
}

export function detailFromLocation(location: {
  pathname: string;
  search?: string;
}): DetailNavigationState {
  return { from: currentAppPath(location) };
}

export function backPathFromState(state: unknown, fallback: string) {
  if (!state || typeof state !== "object" || !("from" in state)) {
    return fallback;
  }
  const from = (state as DetailNavigationState).from;
  return isSafeAppPath(from) ? from : fallback;
}

export function useDetailBackTo(fallback: string) {
  const location = useLocation();
  return backPathFromState(location.state, fallback);
}
