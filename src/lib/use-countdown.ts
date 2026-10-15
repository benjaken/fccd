import { useEffect, useState } from "react";

/**
 * A clock that re-renders the caller on an interval so cutoff countdowns stay
 * current. It never schedules work when the component is unmounted.
 */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
