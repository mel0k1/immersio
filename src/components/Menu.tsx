import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

export interface MenuItem {
  icon?: LucideIcon;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}

export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const style: React.CSSProperties = {};
  if (ref.current) {
    const r = ref.current.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
  }
  return (
    <div className="menu-back" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={ref}
        className="menu"
        style={{ left: x, top: y, ...style }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {items.map((it, i) =>
          it.label === "-" ? (
            <div className="menu-sep" key={i} />
          ) : (
            <button
              key={i}
              className={`menu-item${it.danger ? " danger" : ""}`}
              onClick={() => {
                it.onClick?.();
                onClose();
              }}
            >
              {it.icon && <it.icon size={16} />}
              {it.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
