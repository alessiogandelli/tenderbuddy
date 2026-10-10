import { useEffect, useRef, useState } from "react";
import { formatChf, formatNumber } from "../lib/format";

/** Roll the number to its new value when it changes. `bare` drops the currency. */
export function AnimatedChf({ value, bare = false }: { value: number; bare?: boolean }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const duration = 520;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = from + (to - from) * eased;
      fromRef.current = current;
      setDisplay(current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{bare ? formatNumber(Math.round(display), 0) : formatChf(display)}</>;
}
