import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import i18n from "../src/i18n";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverMock implements ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

afterEach(async () => {
  cleanup();
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  }
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  await i18n.changeLanguage("zh-HK");
});


const { createThenableQuery } = vi.hoisted(() => {
  const emptyQueryResult = { data: [], error: null, count: 0 };

  function createThenableQuery() {
    const query: Record<string, unknown> = {};
    const chain = [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "is",
      "not",
      "neq",
      "eq",
      "gt",
      "gte",
      "lt",
      "lte",
      "or",
      "in",
      "like",
      "ilike",
      "contains",
      "containedBy",
      "overlaps",
      "order",
      "limit",
      "range",
      "single",
      "maybeSingle",
      "csv",
      "filter",
      "match",
    ];
    for (const method of chain) {
      query[method] = vi.fn(() => query);
    }
    query.then = (
      onfulfilled?: (value: typeof emptyQueryResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(emptyQueryResult).then(onfulfilled, onrejected);
    return query;
  }

  return { createThenableQuery };
});

// Prevent unit tests from hitting a real Supabase project (especially main).
vi.mock("@/lib/supabase", () => ({
  supabaseUrl: "https://supabase.test",
  supabasePublishableKey: "sb_publishable_test",
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn(() => createThenableQuery()),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    functions: {
      invoke: vi.fn(async () => ({ data: null, error: null })),
    },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(async () => ({
        data: { session: null, user: null },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));
