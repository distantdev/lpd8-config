import { useCallback, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndoRedo<T>(initialValue: T | (() => T), maxHistory = 50) {
  const [history, setHistory] = useState<HistoryState<T>>(() => ({
    past: [],
    present:
      typeof initialValue === 'function'
        ? (initialValue as () => T)()
        : initialValue,
    future: [],
  }));

  const set = useCallback(
    (updater: T | ((prev: T) => T), recordHistory = true) => {
      setHistory((prev) => {
        const nextPresent =
          typeof updater === 'function'
            ? (updater as (p: T) => T)(prev.present)
            : updater;

        if (Object.is(nextPresent, prev.present)) {
          return prev;
        }

        if (!recordHistory) {
          return {
            past: prev.past,
            present: nextPresent,
            future: prev.future,
          };
        }

        const nextPast = [...prev.past, prev.present];
        if (nextPast.length > maxHistory) {
          nextPast.shift();
        }

        return {
          past: nextPast,
          present: nextPresent,
          future: [],
        };
      });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const nextPast = prev.past.slice(0, -1);
      return {
        past: nextPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const nextFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: nextFuture,
      };
    });
  }, []);

  const reset = useCallback((value: T) => {
    setHistory({
      past: [],
      present: value,
      future: [],
    });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
