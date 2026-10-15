// Keyboard shortcuts for the study screens (flip, rate, answer, move).
// Keys are ignored while typing in a field, while a dialog is open, or with
// Ctrl/Cmd/Alt held, so browser shortcuts keep working.
import { useEffect, useRef } from "react";

export type StudyKeyMap = Partial<Record<string, () => void>>;

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

// Keys are matched by `event.key`, lower-cased for letters (" " for Space,
// "ArrowLeft", "Enter", "a"…).
export function useStudyKeys(keys: StudyKeyMap, enabled = true) {
  const latest = useRef(keys);
  latest.current = keys;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return;
      if (typingInField(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const run = latest.current[key];
      if (!run) return;
      // Stops Space from also scrolling the page or pressing a focused button.
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
