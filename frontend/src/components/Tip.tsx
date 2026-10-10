import { useId, useState, type ReactNode } from "react";

/**
 * A tooltip that opens on hover and on keyboard focus, closes on Esc, and is
 * announced through `aria-describedby`. The trigger is focusable on its own.
 */
export function Tip({
  content,
  children,
  className = "",
  placement = "top",
  label,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  placement?: "top" | "bottom";
  /** Accessible name when the trigger has no text of its own. */
  label?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`tip ${className}`}
      tabIndex={0}
      aria-describedby={id}
      aria-label={label}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {children}
      <span role="tooltip" id={id} className={`tip__bubble tip__bubble--${placement} ${open ? "is-open" : ""}`}>
        {content}
      </span>
    </span>
  );
}
