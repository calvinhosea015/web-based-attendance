import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'uiCompact';

/** Apply persisted compact mode before first paint (call from main.jsx). */
export function initCompactMode() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      document.documentElement.dataset.compact = 'true';
    }
  } catch {
    /* storage blocked */
  }
}

export function isCompactMode() {
  return document.documentElement.dataset.compact === 'true';
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function applyCompact(compact) {
  if (compact) {
    document.documentElement.dataset.compact = 'true';
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  } else {
    delete document.documentElement.dataset.compact;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function useCompactMode() {
  const [compact, setCompactState] = useState(readStored);

  useEffect(() => {
    applyCompact(compact);
  }, [compact]);

  const setCompact = useCallback((next) => {
    setCompactState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const toggleCompact = useCallback(() => {
    setCompactState((prev) => !prev);
  }, []);

  return { compact, setCompact, toggleCompact };
}

// ponytail: self-check — dataset must mirror stored preference
if (import.meta.env?.DEV) {
  initCompactMode();
  const stored = readStored();
  const applied = isCompactMode();
  if (stored !== applied) {
    console.warn('[useCompactMode] storage/dataset mismatch', { stored, applied });
  }
}
