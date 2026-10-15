// Live-or-demo switch. The app probes `/api/health` once at boot; when the
// backend (the Cloudflare tunnel to the demo laptop) is unreachable it drops to
// the preloaded example. Any live call that dies at the network level switches
// the mode too, so a tunnel that goes down mid-session degrades gracefully.
import { useEffect, useState } from "react";
import { API_BASE } from "./config";

export type ConnectionMode = "probing" | "live" | "demo";

let mode: ConnectionMode = "probing";
const listeners = new Set<() => void>();

export function getConnectionMode(): ConnectionMode {
  return mode;
}

function setMode(next: ConnectionMode) {
  if (mode === next) return;
  mode = next;
  for (const listener of listeners) listener();
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const PROBE_TIMEOUT_MS = 4000;

let inflight: Promise<ConnectionMode> | null = null;

async function runProbe(): Promise<ConnectionMode> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    window.clearTimeout(timer);
    // Require the health payload, not just a 200: a static host's SPA fallback
    // answers /api/health with index.html and 200, which is not a live backend.
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { contract_version?: unknown } | null;
      if (body && typeof body.contract_version === "string") {
        setMode("live");
        return "live";
      }
    }
  } catch {
    /* unreachable: fall through to the example */
  }
  setMode("demo");
  return "demo";
}

/**
 * Ask the backend if it is there. The first probe is shared by every early
 * caller (the app races its first fetches against this); `force` re-probes for
 * the reconnect button.
 */
export function probeConnection(force = false): Promise<ConnectionMode> {
  if (force || inflight == null) inflight = runProbe();
  return inflight;
}

/** Wait for the boot probe before deciding which source answers. */
export async function whenProbed(): Promise<ConnectionMode> {
  if (mode === "probing") await probeConnection();
  return mode;
}

/** A live request failed at the network level: serve the example from here on. */
export function markUnreachable() {
  if (mode !== "demo") setMode("demo");
}

/** React binding for the current mode. Probe the backend separately (see Layout). */
export function useConnection(): ConnectionMode {
  const [state, setState] = useState(getConnectionMode);
  useEffect(() => subscribeConnection(() => setState(getConnectionMode())), []);
  return state;
}
