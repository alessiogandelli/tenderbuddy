import { useEffect, useRef, useState } from "react";

/**
 * A number that follows `target` but trails it: the real count is always a
 * little ahead, so the displayed value eases toward it at a gentle, bounded
 * rate and the number feels alive rather than jumping. Once the run is over
 * (`final`) it sprints, so it lands exactly on the target just before the
 * hand-over. It never overshoots, and snaps down if the target drops (a re-run).
 */
export function useLagTicker(target: number, final = false): number {
  const [value, setValue] = useState(0);
  const state = useRef({ value: 0, target, final });
  state.current.target = target;
  state.current.final = final;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = state.current;
      const gap = s.target - s.value;
      if (gap <= 0) {
        if (s.value !== s.target) {
          s.value = s.target;
          setValue(s.value);
        }
      } else {
        const ease = s.final ? 0.7 : 0.14;
        const step = Math.min(gap, Math.max(gap * ease * dt, dt * 5));
        s.value += step;
        setValue(s.value);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return value;
}
