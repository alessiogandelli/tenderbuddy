import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Where every tape cell was when the reading screen handed over, and its colour. */
export interface MorphStart {
  rects: DOMRect[];
  colors: string[];
}

const DURATION_MS = 820;
const STAGGER_MS = 260;

type Box = { left: number; top: number; width: number; height: number };

function transformOf(box: Box): string {
  return `translate(${box.left}px, ${box.top}px) scale(${box.width}, ${box.height})`;
}

/**
 * The hand-over animation: each cell of the horizontal page tape flies to its
 * place in the vertical page rail of the review screen (`[data-rail-tick]`),
 * in a short wave from the first page to the last. The real rail stays hidden
 * until the cells land, then this overlay disappears.
 */
export function TapeMorph({ start, onEnd }: { start: MorphStart; onEnd: () => void }) {
  const [targets, setTargets] = useState<Box[] | null>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const count = start.rects.length;

  useEffect(() => {
    let timer = 0;
    let second = 0;
    // Two frames: the review screen must be laid out before the rail is measured.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const ticks = document.querySelectorAll<HTMLElement>("[data-rail-tick]");
        if (count === 0 || ticks.length !== count) {
          onEndRef.current();
          return;
        }
        setTargets([...ticks].map((tick) => tick.getBoundingClientRect()));
        timer = window.setTimeout(() => onEndRef.current(), DURATION_MS + STAGGER_MS + 60);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.clearTimeout(timer);
    };
  }, [count]);

  return createPortal(
    <div className="morph" aria-hidden>
      {start.rects.map((rect, index) => (
        <span
          key={index}
          className="morph__tick"
          style={{
            background: start.colors[index],
            transform: transformOf(targets?.[index] ?? rect),
            transitionDuration: `${DURATION_MS}ms`,
            transitionDelay: `${Math.round((index / Math.max(count, 1)) * STAGGER_MS)}ms`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
