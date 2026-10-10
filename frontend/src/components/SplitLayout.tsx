import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelGroupHandle,
  type PanelGroupStorage,
} from "react-resizable-panels";
import { useI18n } from "../i18n";

const SAVE_ID = "tenderbuddy.review.split";
const DEFAULT_LAYOUT = [40, 60];
const LEFT_MIN_PX = 320;
// The right side holds the page rail (40px) and the document (min 400px).
const RIGHT_MIN_PX = 440;
// The handle's own width: panel percentages are of the width without it.
const HANDLE_PX = 8;
const KEY_STEP_PX = 16;
const KEY_STEP_LARGE_PX = 64;

// localStorage may be unavailable (private mode, blocked storage): never throw.
const storage: PanelGroupStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* not persisted: the layout still works for this session */
    }
  },
};

export interface SplitControls {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /** Give the whole width to one side, or restore the split when it already has it. */
  maximizeLeft: () => void;
  maximizeRight: () => void;
}

/**
 * Two resizable sides. The handle sits on the left edge of the right side (the
 * page rail), so the rail moves with the divider. Pixel minimums are turned
 * into percentages of the current width; arrows move the handle by 16px
 * (Shift: 64px), Enter collapses the left side, double-click resets.
 */
export function SplitLayout({
  left,
  right,
}: {
  left: (controls: SplitControls) => ReactNode;
  right: (controls: SplitControls) => ReactNode;
}) {
  const { t } = useI18n();
  const groupRef = useRef<ImperativePanelGroupHandle | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // Only the collapsed flags are state: storing the whole layout would
  // re-render both sides on every pointer move of a drag.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Measured before the panels mount, so a saved layout is never clamped by
  // minimums computed for a width of zero.
  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth - HANDLE_PX));
    observer.observe(node);
    setWidth(node.clientWidth - HANDLE_PX);
    return () => observer.disconnect();
  }, []);

  const toPercent = (px: number) => (px / Math.max(width, 1)) * 100;
  // Two minimums wider than the window cannot both hold: split what there is.
  const leftMin = Math.min(toPercent(LEFT_MIN_PX), 50);
  const rightMin = Math.min(toPercent(RIGHT_MIN_PX), 50);

  const onLayout = (sizes: number[]) => {
    setLeftCollapsed(sizes[0] < 0.5);
    setRightCollapsed(sizes[1] < 0.5);
  };

  const setSplit = (next: number[]) => groupRef.current?.setLayout(next);
  const controls: SplitControls = {
    leftCollapsed,
    rightCollapsed,
    maximizeLeft: () => setSplit(rightCollapsed ? DEFAULT_LAYOUT : [100, 0]),
    maximizeRight: () => setSplit(leftCollapsed ? DEFAULT_LAYOUT : [0, 100]),
  };

  // Arrow keys in pixels. Runs in the capture phase, before the library's own
  // handler, which skips events that are already handled.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.target as HTMLElement).closest("[data-split-handle]")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const current = groupRef.current?.getLayout();
      const base = node.clientWidth - HANDLE_PX;
      if (!current || base <= 0) return;
      event.preventDefault();
      const px = (event.shiftKey ? KEY_STEP_LARGE_PX : KEY_STEP_PX) * (event.key === "ArrowLeft" ? -1 : 1);
      const min = (LEFT_MIN_PX / base) * 100;
      const max = 100 - (RIGHT_MIN_PX / base) * 100;
      const next = Math.min(Math.max(current[0] + (px / base) * 100, min), max);
      groupRef.current?.setLayout([next, 100 - next]);
    };
    node.addEventListener("keydown", onKey, true);
    return () => node.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="split" ref={wrapRef}>
      {width > 0 && (
      <PanelGroup
        ref={groupRef}
        direction="horizontal"
        autoSaveId={SAVE_ID}
        storage={storage}
        onLayout={onLayout}
      >
        <Panel
          id="items"
          order={1}
          defaultSize={DEFAULT_LAYOUT[0]}
          minSize={leftMin}
          collapsible
          collapsedSize={0}
          className="split__left"
        >
          {left(controls)}
        </Panel>
        <PanelResizeHandle
          className="split__handle"
          data-split-handle
          aria-orientation="vertical"
          aria-label={t("split.handle")}
          title={t("split.handleHint")}
          onDoubleClick={() => setSplit(DEFAULT_LAYOUT)}
        >
          <span className="split__grip" aria-hidden />
        </PanelResizeHandle>
        <Panel
          id="document"
          order={2}
          defaultSize={DEFAULT_LAYOUT[1]}
          minSize={rightMin}
          collapsible
          collapsedSize={0}
          className="split__right"
        >
          {right(controls)}
        </Panel>
      </PanelGroup>
      )}
    </div>
  );
}
