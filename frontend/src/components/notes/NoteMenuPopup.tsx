import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// Focus only while the popup is open. A delayed focus after dismissal would steal
// the next keyboard command from the note view.
export function NoteMenuPopup({ open, children }: { open: boolean; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    let attempts = 0;
    let frame: number;
    const focusMenu = () => {
      const menu = container.current?.querySelector<HTMLElement>('[role="menu"]');
      menu?.focus({ preventScroll: true });
      if (menu && document.activeElement === menu) return;
      if (++attempts < 10) frame = requestAnimationFrame(focusMenu);
    };
    frame = requestAnimationFrame(focusMenu);
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return <div ref={container}>{children}</div>;
}
