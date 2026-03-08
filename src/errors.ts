export type GoogleMapsUrlErrorCode =
  | "empty_input"
  | "invalid_url"
  | "disallowed_hostname"
  | "unsupported_url"
  | "redirect_limit"
  | "network_timeout"
  | "network_error"
  | "provider_error";

interface ErrorInit {
  readonly details?: string | undefined;
  readonly cause?: unknown;
}

export class GoogleMapsUrlError extends Error {
  readonly code: GoogleMapsUrlErrorCode;
  readonly details?: string | undefined;

  constructor(code: GoogleMapsUrlErrorCode, message: string, init?: ErrorInit) {
    super(message, init?.cause === undefined ? undefined : { cause: init.cause });
    this.name = "GoogleMapsUrlError";
    this.code = code;
    this.details = init?.details;
  }
}

export class InvalidGoogleMapsUrlError extends GoogleMapsUrlError {
  constructor(message: string, init?: ErrorInit) {
    super("invalid_url", message, init);
    this.name = "InvalidGoogleMapsUrlError";
  }
}

export class EmptyInputError extends GoogleMapsUrlError {
  constructor() {
    super("empty_input", "Input must be a non-empty string.");
    this.name = "EmptyInputError";
  }
}

export class DisallowedHostnameError extends GoogleMapsUrlError {
  readonly hostname: string;

  constructor(hostname: string) {
    super("disallowed_hostname", "Hostname is not an allowed Google Maps host.", {
      details: hostname,
    });
    this.name = "DisallowedHostnameError";
    this.hostname = hostname;
  }
}

export class UnsupportedGoogleMapsUrlError extends GoogleMapsUrlError {
  constructor(message: string, init?: ErrorInit) {
    super("unsupported_url", message, init);
    this.name = "UnsupportedGoogleMapsUrlError";
  }
}

export class RedirectLimitError extends GoogleMapsUrlError {
  readonly maxRedirects: number;

  constructor(maxRedirects: number) {
    super(
      "redirect_limit",
      `Redirect chain exceeded the configured maximum of ${maxRedirects}.`,
      { details: String(maxRedirects) },
    );
    this.name = "RedirectLimitError";
    this.maxRedirects = maxRedirects;
  }
}

export class NetworkTimeoutError extends GoogleMapsUrlError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("network_timeout", `Network request timed out after ${timeoutMs}ms.`, {
      details: String(timeoutMs),
    });
    this.name = "NetworkTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class NetworkRequestError extends GoogleMapsUrlError {
  constructor(message: string, init?: ErrorInit) {
    super("network_error", message, init);
    this.name = "NetworkRequestError";
  }
}

export class GoogleProviderError extends GoogleMapsUrlError {
  readonly provider: "geocoding" | "reverse-geocoding" | "places" | "directions";
  readonly providerStatus: string | null;

  constructor(
    provider: "geocoding" | "reverse-geocoding" | "places" | "directions",
    providerStatus: string | null,
    message: string,
    init?: ErrorInit,
  ) {
    super("provider_error", message, init);
    this.name = "GoogleProviderError";
    this.provider = provider;
    this.providerStatus = providerStatus;
  }
}
