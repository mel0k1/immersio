import { useState } from "react";
import { Music2, User, Disc3, ListMusic, FolderOpen } from "lucide-react";
import type { ItemKind } from "../types";

export function Cover({
  src,
  round,
  kind,
}: {
  src: string | null | undefined;
  round?: boolean;
  kind?: ItemKind | "local" | "liked" | "none";
}) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <div className={`cover-ph${round ? " card-cover round" : ""}`} style={{ borderRadius: round ? "999px" : undefined }}>
      {show ? (
        <img
          src={src}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: round ? "999px" : undefined }}
        />
      ) : (
        <div className="cover-ph empty-cover" style={{ width: "100%", height: "100%" }}>
          {kind === "liked" ? (
            <Heart2 />
          ) : kind === "artist" ? (
            <User size={38} />
          ) : kind === "album" ? (
            <Disc3 size={38} />
          ) : kind === "playlist" ? (
            <ListMusic size={38} />
          ) : kind === "local" ? (
            <FolderOpen size={38} />
          ) : (
            <Music2 size={34} />
          )}
        </div>
      )}
    </div>
  );
}

function Heart2() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff" opacity="0.92">
      <path d="M12 21s-7.5-4.7-10-9.3C.5 8 2.4 4.5 6 4.5c2.2 0 3.6 1.2 4.4 2.4h1.2c.8-1.2 2.2-2.4 4.4-2.4 3.6 0 5.5 3.5 4 7.2C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}
