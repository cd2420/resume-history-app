// Telegram callback_data is limited to 64 bytes, so UUIDs travel as 22-char base64url.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeId(uuid: string): string {
  if (!UUID_RE.test(uuid)) throw new Error("not a uuid");
  return Buffer.from(uuid.replaceAll("-", ""), "hex").toString("base64url");
}

export function decodeId(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(value)) return null;
  const hex = Buffer.from(value, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type CallbackAction =
  | { kind: "record" }
  | { kind: "skip"; sessionId: string }
  | { kind: "save" | "edit" | "cancel" | "move" | "back"; pendingId: string }
  | { kind: "pick"; pendingId: string; projectId: string }
  | { kind: "current"; projectId: string };

const SINGLE: Record<string, "save" | "edit" | "cancel" | "move" | "back"> = {
  s: "save",
  e: "edit",
  c: "cancel",
  m: "move",
  b: "back",
};

export function callbackData(action: CallbackAction): string {
  switch (action.kind) {
    case "pick":
      return `p:${encodeId(action.pendingId)}:${encodeId(action.projectId)}`;
    case "current":
      return `u:${encodeId(action.projectId)}`;
    case "record":
      return "r";
    case "skip":
      return `k:${encodeId(action.sessionId)}`;
    default: {
      const code = Object.keys(SINGLE).find((key) => SINGLE[key] === action.kind)!;
      return `${code}:${encodeId((action as { pendingId: string }).pendingId)}`;
    }
  }
}

export function parseCallbackData(data: string): CallbackAction | null {
  if (data === "r") return { kind: "record" };
  const [code, first, second, ...rest] = data.split(":");
  if (rest.length > 0 || !first) return null;
  if (code === "p") {
    const pendingId = decodeId(first);
    const projectId = second ? decodeId(second) : null;
    return pendingId && projectId ? { kind: "pick", pendingId, projectId } : null;
  }
  if (second !== undefined) return null;
  if (code === "u") {
    const projectId = decodeId(first);
    return projectId ? { kind: "current", projectId } : null;
  }
  if (code === "k") {
    const sessionId = decodeId(first);
    return sessionId ? { kind: "skip", sessionId } : null;
  }
  const kind = SINGLE[code];
  const pendingId = decodeId(first);
  return kind && pendingId ? { kind, pendingId } : null;
}
