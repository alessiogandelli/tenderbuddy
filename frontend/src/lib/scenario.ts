// The bid scenario chosen on the price page, per tender and per browser. The
// offer export uses the same choice, so the PDF carries the offer you picked.
const KEY = "tenderbuddy.scenario";
export const DEFAULT_SCENARIO = "Target";

export function readScenario(bandoId: string): string {
  try {
    return window.localStorage.getItem(`${KEY}.${bandoId}`) ?? DEFAULT_SCENARIO;
  } catch {
    return DEFAULT_SCENARIO;
  }
}

export function saveScenario(bandoId: string, scenario: string): void {
  try {
    window.localStorage.setItem(`${KEY}.${bandoId}`, scenario);
  } catch {
    /* not persisted: the choice still holds for this page */
  }
}
