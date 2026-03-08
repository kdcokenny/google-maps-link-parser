export function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${String(value)}`);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  return trimmed;
}

export function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseFiniteNumber(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;

  return parsed;
}
