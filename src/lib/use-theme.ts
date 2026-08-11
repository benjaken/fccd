import { useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("food-channel-theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("food-channel-theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggleTheme: () => setDark((current) => !current) };
}
