import { useState, useRef, useCallback } from 'react';

/**
 * Replaces the duplicated message/messageTone/setMessage/setMessageTone/notify pattern
 * found across every page component. Returns [notification, notify].
 *
 * notification: { text, tone } | null
 * notify(text, tone?) — sets message; auto-clears after timeout.
 */
export function useNotify(timeout = 4000) {
  const [notification, setNotification] = useState(null);
  const timer = useRef(null);

  const notify = useCallback((text, tone = 'info') => {
    clearTimeout(timer.current);
    setNotification({ text, tone });
    if (timeout > 0) {
      timer.current = setTimeout(() => setNotification(null), timeout);
    }
  }, [timeout]);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setNotification(null);
  }, []);

  return [notification, notify, dismiss];
}
