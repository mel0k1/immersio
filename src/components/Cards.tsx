import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { Cover } from "./Cover";
import type { ItemKind } from "../types";

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CollectionCard({
  title,
  subtitle,
  cover,
  kind,
  badge,
  onOpen,
  onPlay,
}: {
  title: string;
  subtitle: string;
  cover: string | null | undefined;
  kind: ItemKind | "local" | "liked" | "none";
  badge?: string;
  onOpen: () => void;
  onPlay?: () => void;
}) {
  return (
    <div className="card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="card-cover">
        <Cover src={cover} kind={kind} />
        {badge && <span className="card-badge">{badge}</span>}
        {onPlay && (
          <button
            className="card-play"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <Play size={19} fill="currentColor" style={{ marginLeft: 2 }} />
          </button>
        )}
      </div>
      <div className="card-title">{title}</div>
      <div className="card-sub">{subtitle}</div>
    </div>
  );
}
