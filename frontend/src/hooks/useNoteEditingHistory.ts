import { createContext, createElement, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Snapshot { text: string; selection: number[] }
interface HistoryState {
  current: { current: Snapshot }; past: { current: Snapshot[] }; future: { current: Snapshot[] }; typingTime: { current: number };
}
const NoteHistoryContext = createContext<Map<string, HistoryState> | null>(null);
export function NoteHistoryProvider({ children }: { children: ReactNode }) {
  const store = useRef(new Map<string, HistoryState>());
  return createElement(NoteHistoryContext.Provider, { value: store.current }, children);
}

export function useNoteEditingHistory(text: string, onChange: (text: string) => void, lineId: string) {
  const store = useContext(NoteHistoryContext);
  const [state] = useState<HistoryState>(() => {
    const state = store?.get(lineId) || { current: { current: { text, selection: [] } }, past: { current: [] }, future: { current: [] }, typingTime: { current: 0 } };
    store?.set(lineId, state);
    return state;
  });
  const { current, past, future, typingTime } = state;
  const [selection, setSelectionState] = useState(current.current.selection);
  const [, refresh] = useState(0);
  const redraw = () => refresh(value => value + 1);
  const remember = () => { past.current.push(current.current); if (past.current.length > 100) past.current.shift(); };
  const setSelection = (next: number[]) => {
    current.current = { ...current.current, selection: next };
    setSelectionState(next);
  };
  useEffect(() => {
    if (text === current.current.text) return;
    // Rescans and accepting model suggestions are also reversible during this session.
    remember();
    future.current = [];
    current.current = { text, selection: [] };
    setSelectionState([]);
    typingTime.current = 0;
    redraw();
  }, [text]);

  function commit(nextText: string, nextSelection: number[], typing = false) {
    if (nextText !== current.current.text) {
      if (!typing || Date.now() - typingTime.current > 700) remember();
      future.current = [];
      typingTime.current = typing ? Date.now() : 0;
      current.current = { text: nextText, selection: nextSelection };
      onChange(nextText);
      redraw();
    }
    setSelection(nextSelection);
  }
  function travel(redo: boolean) {
    const source = redo ? future : past;
    const target = redo ? past : future;
    const next = source.current.pop();
    if (!next) return;
    target.current.push(current.current);
    current.current = next;
    typingTime.current = 0;
    setSelectionState(next.selection);
    onChange(next.text);
    redraw();
  }
  return { selection, setSelection, commit, undo: () => travel(false), redo: () => travel(true), canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
