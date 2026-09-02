import { useEffect, useState } from "react";

const STORAGE_KEY = "food-channel-comfort-mode";

export function useComfortMode() {
  const [comfortMode, setComfortMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, comfortMode ? "on" : "off");
  }, [comfortMode]);

  return {
    comfortMode,
    toggleComfortMode: () => setComfortMode((current) => !current),
  };
}
