/**
 * Preview / local one-click sign-in helpers.
 *
 * Credentials must be provided via Vite env vars and are only activated when
 * VITE_ENABLE_QUICK_LOGIN=true. Do not enable this on production hosts.
 */
export type QuickLoginCredentials = {
  email: string;
  password: string;
};

export function getQuickLoginCredentials(): QuickLoginCredentials | null {
  if (import.meta.env.VITE_ENABLE_QUICK_LOGIN !== "true") {
    return null;
  }

  const email = String(import.meta.env.VITE_QUICK_LOGIN_EMAIL || "").trim();
  const password = String(import.meta.env.VITE_QUICK_LOGIN_PASSWORD || "");

  if (!email || !password) return null;
  return { email, password };
}

export function shouldAutologinFromUrl(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): boolean {
  const params = new URLSearchParams(search);
  return params.get("autologin") === "1";
}

export function stripAutologinParam(url: URL = new URL(window.location.href)) {
  url.searchParams.delete("autologin");
  return `${url.pathname}${url.search}${url.hash}`;
}
