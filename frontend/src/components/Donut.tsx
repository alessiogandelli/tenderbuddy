import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
  /** Accessible name, read with the amount. */
  label: string;
  /** Hatched instead of solid: the "still to check" look of the price chart. */
  hatched?: boolean;
  /** Can be clicked (or Enter) to open what it stands for. */
  link?: boolean;
}

export interface DonutRing {
  /** Middle of the ring, and its thickness, in px of the `size` box. */
  radius: number;
  width: number;
  segments: DonutSegment[];
}

const GAP = 2.2; // px left empty between two segments

/**
 * Concentric rings of arcs over one shared total, so an outer ring can split
 * the arcs of an inner one (a parent and its parts line up). Arcs are circle
 * strokes with a dash: they sweep in on mount and slide when values change.
 * Hover or focus marks an arc (`active`, shared with a legend); the centre
 * shows whatever the page puts there.
 */
export function Donut({
  size,
  rings,
  total,
  active,
  marked = [],
  onActive,
  onSelect,
  label,
  children,
}: {
  size: number;
  rings: DonutRing[];
  total: number;
  active: string | null;
  /** Arcs to bring forward together (e.g. what a hovered group moves). */
  marked?: string[];
  onActive: (key: string | null) => void;
  onSelect?: (key: string) => void;
  label: string;
  children?: ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const centre = size / 2;
  const lit = active ? [active] : marked;
  const hatchColors = [...new Set(rings.flatMap((ring) => ring.segments.filter((s) => s.hatched).map((s) => s.color)))];
  const hatchId = (color: string) => `${uid}-hatch-${color.replace(/[^a-z0-9]/gi, "")}`;

  const onKey = (event: KeyboardEvent, segment: DonutSegment) => {
    if (event.key === "Escape") onActive(null);
    if ((event.key === "Enter" || event.key === " ") && segment.link && onSelect) {
      event.preventDefault();
      onSelect(segment.key);
    }
  };

  return (
    <div className={`donut ${lit.length ? "has-active" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} role="group" aria-label={label}>
        <defs>
          {hatchColors.map((color) => (
            <pattern
              key={color}
              id={hatchId(color)}
              patternUnits="userSpaceOnUse"
              width="6"
              height="6"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="#ffffff" />
              <rect width="2.8" height="6" fill={color} />
            </pattern>
          ))}
        </defs>
        {rings.map((ring, ringIndex) => {
          const circumference = 2 * Math.PI * ring.radius;
          let start = 0;
          return (
            <g key={ringIndex}>
              <circle className="donut__track" cx={centre} cy={centre} r={ring.radius} strokeWidth={ring.width} />
              {ring.segments.map((segment) => {
                const length = total > 0 ? (Math.max(segment.value, 0) / total) * circumference : 0;
                const from = start;
                start += length;
                if (length <= 0) return null;
                const visible = grown ? Math.max(length - GAP, 0.6) : 0;
                const isActive = lit.includes(segment.key);
                return (
                  <circle
                    key={segment.key}
                    className={`donut__arc ${isActive ? "is-active" : ""} ${segment.link ? "is-link" : ""}`}
                    cx={centre}
                    cy={centre}
                    r={ring.radius}
                    fill="none"
                    stroke={segment.hatched ? `url(#${hatchId(segment.color)})` : segment.color}
                    strokeWidth={isActive ? ring.width + 7 : ring.width}
                    strokeDasharray={`${visible} ${circumference}`}
                    strokeDashoffset={grown ? -(from + GAP / 2) : 0}
                    transform={`rotate(-90 ${centre} ${centre})`}
                    tabIndex={0}
                    role={segment.link ? "link" : "img"}
                    aria-label={segment.label}
                    onMouseEnter={() => onActive(segment.key)}
                    onMouseLeave={() => onActive(null)}
                    onFocus={() => onActive(segment.key)}
                    onBlur={() => onActive(null)}
                    onKeyDown={(event) => onKey(event, segment)}
                    onClick={() => segment.link && onSelect?.(segment.key)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {children && <div className="donut__centre">{children}</div>}
    </div>
  );
}
