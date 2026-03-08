import { DisallowedHostnameError, UnsupportedGoogleMapsUrlError } from "./errors";

export const SHORT_LINK_DOMAINS: ReadonlySet<string> = new Set([
  "goo.gl",
  "maps.app.goo.gl",
]);

export const UNSUPPORTED_SHORTLINK_DOMAINS: ReadonlySet<string> = new Set([
  "share.google",
]);

const GOOGLE_HOSTNAME_PATTERN =
  /^(?:maps\.|www\.)?google\.(?:[a-z]{2,63}|(?:com|co)\.[a-z]{2})$/i;

const MAPS_PATH_PATTERN = /^\/maps(?:\/|$)/;

const AT_COORDINATES_PATTERN = /@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?(?:,|$)/;

const PUBLIC_WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

export function isShortLinkDomain(hostname: string): boolean {
  return SHORT_LINK_DOMAINS.has(hostname.toLowerCase());
}

export function isGoogleMapsHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  if (isShortLinkDomain(normalizedHostname)) return true;
  if (UNSUPPORTED_SHORTLINK_DOMAINS.has(normalizedHostname)) return true;

  return GOOGLE_HOSTNAME_PATTERN.test(normalizedHostname);
}

export function isAllowedGoogleMapsDomain(hostname: string): boolean {
  return isGoogleMapsHostname(hostname);
}

export function classifyHostname(
  hostname: string,
): "standard" | "shortlink" | "unsupported-shortlink" | "disallowed" | "unknown" {
  const normalizedHostname = hostname.toLowerCase();
  if (normalizedHostname === "") return "unknown";
  if (isShortLinkDomain(normalizedHostname)) return "shortlink";
  if (UNSUPPORTED_SHORTLINK_DOMAINS.has(normalizedHostname)) {
    return "unsupported-shortlink";
  }
  if (GOOGLE_HOSTNAME_PATTERN.test(normalizedHostname)) return "standard";
  return "disallowed";
}

export function canonicalizeGoogleMapsUrl(rawUrl: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!isShortLinkDomain(parsedUrl.hostname)) return rawUrl;

  if (!parsedUrl.searchParams.has("g_st")) return rawUrl;

  parsedUrl.searchParams.delete("g_st");
  return parsedUrl.toString();
}

export function isGoogleMapsUrl(rawValue: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawValue);
  } catch {
    return false;
  }

  if (!PUBLIC_WEB_PROTOCOLS.has(parsedUrl.protocol.toLowerCase())) {
    return false;
  }

  const hostKind = classifyHostname(parsedUrl.hostname);
  if (hostKind === "shortlink" || hostKind === "unsupported-shortlink") {
    return true;
  }

  if (hostKind !== "standard") return false;

  const isMapsHost = parsedUrl.hostname.toLowerCase().startsWith("maps.");
  const hasMapPath = MAPS_PATH_PATTERN.test(parsedUrl.pathname);
  const hasAtCoordinates = AT_COORDINATES_PATTERN.test(parsedUrl.pathname);
  const hasUsefulParams =
    parsedUrl.searchParams.has("q") ||
    parsedUrl.searchParams.has("query") ||
    parsedUrl.searchParams.has("destination") ||
    parsedUrl.searchParams.has("origin") ||
    parsedUrl.searchParams.has("ll") ||
    parsedUrl.searchParams.has("sll") ||
    parsedUrl.searchParams.has("viewpoint") ||
    parsedUrl.searchParams.has("map_action");

  if (hasMapPath) return true;
  if (isMapsHost && hasAtCoordinates) return true;
  if (isMapsHost && hasUsefulParams) return true;

  return false;
}

export function assertAllowedHostname(hostname: string): void {
  const hostKind = classifyHostname(hostname);

  if (hostKind === "disallowed") {
    throw new DisallowedHostnameError(hostname);
  }

  if (hostKind === "unsupported-shortlink") {
    throw new UnsupportedGoogleMapsUrlError(
      "share.google links are recognized but unsupported for public resolution.",
      { details: hostname },
    );
  }
}
