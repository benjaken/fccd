import { useCallback, useEffect, useRef, useState } from "react";

import { useIsMobile } from "@/lib/use-media-query";

/**
 * Desktop: committing a filter updates the list immediately.
 * Mobile: the control edits a draft until `confirm()` (drawer 確定).
 */
export function useDeferredFilter<T>(applied: T, commit: (value: T) => void) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState(applied);
  const commitRef = useRef(commit);
  const draftRef = useRef(draft);
  const appliedRef = useRef(applied);
  commitRef.current = commit;
  draftRef.current = draft;
  appliedRef.current = applied;

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const setValue = useCallback(
    (value: T) => {
      setDraft(value);
      if (!isMobile && !Object.is(value, appliedRef.current)) {
        commitRef.current(value);
      }
    },
    [isMobile],
  );

  const confirm = useCallback(() => {
    const current = draftRef.current;
    if (Object.is(current, applied)) return;
    commitRef.current(current);
  }, [applied]);

  const revert = useCallback(() => {
    setDraft(applied);
  }, [applied]);

  return { value: draft, setValue, confirm, revert };
}
