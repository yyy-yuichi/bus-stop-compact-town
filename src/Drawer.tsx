import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface DrawerProps {
  title: string;
  eyebrow?: string;
  description?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Mount when open. A non-modal drawer keeps the map available for interaction. */
export default function Drawer({ title, eyebrow, description, closeLabel = 'ドロワーを閉じる', onClose, children }: DrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const drawer = drawerRef.current;
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected &&
          (drawer?.contains(document.activeElement) || document.activeElement === document.body)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  return <aside ref={drawerRef} role="dialog" aria-labelledby={titleId}
    className="drawer absolute inset-y-0 right-0 z-[1200] flex w-[380px] max-w-[calc(100%-32px)] translate-x-0 flex-col border-l border-sky-200 bg-white shadow-2xl transition-transform duration-200 starting:translate-x-full motion-reduce:transition-none">
    <header className="flex items-start justify-between gap-4 border-b border-sky-100 bg-sky-50 px-6 pb-5 pt-[max(24px,env(safe-area-inset-top))]">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-sky-700">{eyebrow}</p>}
        <h2 id={titleId} className="break-words text-xl font-bold leading-relaxed text-sky-950">{title}</h2>
        {description && <p className="mt-1 text-xs text-sky-800">{description}</p>}
      </div>
      <button ref={closeRef} onClick={onClose} aria-label={closeLabel}
        className="grid size-11 shrink-0 place-items-center rounded-full border border-sky-200 bg-white text-xl text-sky-950 hover:bg-sky-100">
        <span aria-hidden="true">×</span>
      </button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      {children}
    </div>
  </aside>;
}
