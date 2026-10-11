import type { CSSProperties } from "react";
import { PAGE_TYPE_COLORS } from "../lib/pageTypes";

/**
 * The vision hero. One segment per quantity-table (LV) page, filling left to
 * right as the vision engine reads them. It deliberately echoes the page tape —
 * same segment language, chunkier blocks — so it reads as "the tape, zoomed in
 * on the pages that matter". A soft sheen travels across it while it runs.
 */
export function VisionProgress({
  total,
  done,
  active,
  dimmed = false,
  ariaLabel,
}: {
  total: number;
  done: number;
  active: boolean;
  dimmed?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      className={`vbar ${dimmed ? "is-dimmed" : ""}`}
      style={{ "--lv": PAGE_TYPE_COLORS.lv_table } as CSSProperties}
    >
      <div
        className={`vbar__track ${active ? "is-active" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={ariaLabel}
      >
        {Array.from({ length: total }, (_, index) => {
          const filled = index < done;
          const current = active && done < total && index === done;
          return (
            <span
              key={index}
              className={`vbar__seg ${filled ? "is-done" : ""} ${current ? "is-current" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}
