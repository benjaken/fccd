import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(value: number, duration = 700) {
  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || duration <= 0) {
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }

    const startValue = displayedRef.current;
    const difference = value - startValue;
    if (difference === 0) return;

    const startedAt = performance.now();
    let frame = 0;
    const animate = (timestamp: number) => {
      const elapsed = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = startValue + difference * eased;
      displayedRef.current = next;
      setDisplayed(next);
      if (elapsed < 1) frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);

  return displayed;
}
