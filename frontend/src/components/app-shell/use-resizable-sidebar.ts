import { useCallback, useEffect, useRef, useState } from 'react';

const SIDEBAR_KEY = 'appnation-sidebar-width';
const SIDEBAR_DEFAULT = 288;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const SIDEBAR_LEFT_OFFSET = 16;

interface ResizableSidebar {
  width: number;
  startDrag: (e: React.MouseEvent) => void;
  dragging: boolean;
}

export const useResizableSidebar = (): ResizableSidebar => {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    const saved = window.localStorage.getItem(SIDEBAR_KEY);
    if (!saved) return SIDEBAR_DEFAULT;
    const parsed = Number.parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= SIDEBAR_MIN && parsed <= SIDEBAR_MAX
      ? parsed
      : SIDEBAR_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - SIDEBAR_LEFT_OFFSET));
      setWidth(next);
    };
    const onUp = (): void => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(width));
  }, [width]);

  const startDrag = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return { width, startDrag, dragging };
};
