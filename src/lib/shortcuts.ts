export function comboOf(e: KeyboardEvent): string | null {
  const codes = ["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight", "CapsLock", "Dead", "Escape", "Tab", "Backspace", "Delete", "Enter"];
  if (codes.includes(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.code);
  return parts.join("+");
}

const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  ArrowRight: "→",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Slash: "/",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Backquote: "`",
};

export function comboLabel(combo: string): string {
  return combo
    .split("+")
    .map((p) => {
      if (p in KEY_LABELS) return KEY_LABELS[p];
      if (p.startsWith("Key") || p.startsWith("Digit")) return p.slice(3);
      if (p.startsWith("Numpad")) return `Num${p.slice(6)}`;
      return p;
    })
    .join(" + ");
}
