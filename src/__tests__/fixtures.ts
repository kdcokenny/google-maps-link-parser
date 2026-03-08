import type { CoordinateSource, GoogleMapsIntent } from "../types";

export const STABLE_COORDINATE_URLS = {
  atPattern: "https://www.google.com/maps/@24.7136,46.6753,15z",
  queryPattern: "https://maps.google.com/?q=24.861307,46.646618",
  dataPattern: "https://www.google.com/maps/place/Some+Place/data=!3d24.7136!4d46.6753",
  placePath: "https://www.google.com/maps/place/24.7136,46.6753",
  llPattern: "https://www.google.com/maps?ll=24.7136,46.6753",
} as const;

export const TEXT_URLS = {
  queryText: "https://www.google.com/maps?q=Malaz+Riyadh",
  placePathText:
    "https://www.google.com/maps/place/%D8%AD%D9%8A+%D8%A7%D9%84%D9%85%D9%84%D8%A7%D8%B2/data=!4m2!3m1!1s0x123:0x456",
  directions: "https://www.google.com/maps/dir/Riyadh/Diriyah?travelmode=driving",
  pano: "https://www.google.com/maps?map_action=pano&viewpoint=24.7136,46.6753&pano=test-pano",
} as const;

export const SHORTLINKS = {
  mapsApp: "https://maps.app.goo.gl/abc123?g_st=ic",
  gooLegacy: "https://goo.gl/maps/legacy123",
  unsupported: "https://share.google/FGT36rRoOI3ukfIad",
} as const;

export const GEOCODING_OK = {
  status: "OK",
  results: [
    {
      formatted_address: "Malaz, Riyadh Saudi Arabia",
      place_id: "place-123",
      types: ["neighborhood"],
      geometry: {
        location: { lat: 24.7136, lng: 46.6753 },
      },
      address_components: [
        {
          long_name: "Malaz",
          short_name: "Malaz",
          types: ["sublocality_level_1"],
        },
        { long_name: "Riyadh", short_name: "Riyadh", types: ["locality"] },
        { long_name: "Saudi Arabia", short_name: "SA", types: ["country"] },
      ],
      plus_code: {
        global_code: "7HVGPR8G+CM",
        compound_code: "PR8G+CM Riyadh",
      },
    },
  ],
} as const;

export const DIRECTIONS_OK = {
  status: "OK",
  routes: [
    {
      overview_polyline: { points: "encoded-polyline" },
      legs: [
        {
          distance: { value: 12000 },
          duration: { value: 900 },
        },
      ],
    },
  ],
} as const;

export const PROVIDER_DENIED = {
  status: "REQUEST_DENIED",
  error_message: "API key is invalid",
} as const;

export type LiveBehaviorClassification = "direct-coords" | "query-text";

export interface LiveStableDirectFixture {
  readonly label: string;
  readonly url: string;
  readonly expectedLatitude: number;
  readonly expectedLongitude: number;
  readonly expectedSource: CoordinateSource;
  readonly allowedIntents?: readonly GoogleMapsIntent[];
}

export interface LiveShortlinkFixture {
  readonly label: string;
  readonly url: string;
  readonly expectedBehavior: LiveBehaviorClassification;
  readonly allowedCoordinateSources: readonly CoordinateSource[];
  readonly allowedIntents?: readonly GoogleMapsIntent[];
  readonly notes?: string;
}

export interface LiveFailFastFixture {
  readonly label: string;
  readonly url: string;
  readonly expectedErrorCode: "disallowed_hostname" | "unsupported_url";
}

export const LIVE_ALLOWED_COORDINATE_SOURCES: readonly CoordinateSource[] = [
  "at-pattern",
  "query-param",
  "data-param",
  "place-path",
  "ll-param",
  "destination-param",
  "viewpoint-param",
  "html-json-ld",
  "html-geo-intent",
  "html-data-param",
  "html-app-state",
  "html-center-pattern",
  "html-app-initialization-state",
] as const;

export const LIVE_STABLE_DIRECT_FIXTURES: readonly LiveStableDirectFixture[] = [
  {
    label: "stable @-pattern URL",
    url: STABLE_COORDINATE_URLS.atPattern,
    expectedLatitude: 24.7136,
    expectedLongitude: 46.6753,
    expectedSource: "at-pattern",
    allowedIntents: ["coordinates"],
  },
  {
    label: "stable q= coordinates URL",
    url: STABLE_COORDINATE_URLS.queryPattern,
    expectedLatitude: 24.861307,
    expectedLongitude: 46.646618,
    expectedSource: "query-param",
    allowedIntents: ["coordinates"],
  },
  {
    label: "stable ll= legacy coordinates URL",
    url: STABLE_COORDINATE_URLS.llPattern,
    expectedLatitude: 24.7136,
    expectedLongitude: 46.6753,
    expectedSource: "ll-param",
    allowedIntents: ["coordinates"],
  },
] as const;

export const LIVE_SHORTLINK_FIXTURES: readonly LiveShortlinkFixture[] = [
  {
    label: "new user shortlink: tPxrt2JmvQ3Rq26h7",
    url: "https://maps.app.goo.gl/tPxrt2JmvQ3Rq26h7",
    expectedBehavior: "query-text",
    allowedCoordinateSources: LIVE_ALLOWED_COORDINATE_SOURCES,
    allowedIntents: ["unknown", "search", "place", "coordinates"],
    notes:
      "Volatile: often resolves to a staticmap shell, but redirect/html artifacts contain geocode text.",
  },
  {
    label: "new user shortlink: ckCpfJFeCFFRq75d9",
    url: "https://maps.app.goo.gl/ckCpfJFeCFFRq75d9?g_st=ic",
    expectedBehavior: "direct-coords",
    allowedCoordinateSources: LIVE_ALLOWED_COORDINATE_SOURCES,
    allowedIntents: ["coordinates", "place"],
    notes: "Observed to resolve directly to q=lat,lng in live probing.",
  },
  {
    label: "new user shortlink: 1fg5UsDj1G5VTcUn6",
    url: "https://maps.app.goo.gl/1fg5UsDj1G5VTcUn6?g_st=iw",
    expectedBehavior: "query-text",
    allowedCoordinateSources: LIVE_ALLOWED_COORDINATE_SOURCES,
    allowedIntents: ["unknown", "search", "place", "coordinates"],
    notes:
      "Volatile: often resolves to staticmap; query text is preserved in redirect/html artifacts.",
  },
  {
    label: "raqi fixture shortlink: nMGFZKAgCzZNAkRR9",
    url: "https://maps.app.goo.gl/nMGFZKAgCzZNAkRR9",
    expectedBehavior: "query-text",
    allowedCoordinateSources: LIVE_ALLOWED_COORDINATE_SOURCES,
    allowedIntents: ["unknown", "search", "place", "coordinates"],
    notes:
      "Ported from maps-unfurler live fixtures. Treat as volatile and assert structure over exact output.",
  },
  {
    label: "raqi fixture shortlink: tYBvtfJwSSo6nBm29",
    url: "https://maps.app.goo.gl/tYBvtfJwSSo6nBm29",
    expectedBehavior: "query-text",
    allowedCoordinateSources: LIVE_ALLOWED_COORDINATE_SOURCES,
    allowedIntents: ["unknown", "search", "place", "coordinates"],
    notes:
      "Ported from maps-unfurler live fixtures. Redirect chain commonly carries q/ftid hints.",
  },
  {
    label: "raqi fixture shortlink: goo.gl/maps/VZqhN7VdZa79WGhMA",
    url: "https://goo.gl/maps/VZqhN7VdZa79WGhMA",
    expectedBehavior: "direct-coords",
    allowedCoordinateSources: LIVE_ALLOWED_COORDINATE_SOURCES,
    allowedIntents: ["coordinates", "place"],
    notes: "Ported from maps-unfurler live fixtures.",
  },
] as const;

export const LIVE_FAIL_FAST_FIXTURES: readonly LiveFailFastFixture[] = [
  {
    label: "unsupported shortlink host share.google",
    url: SHORTLINKS.unsupported,
    expectedErrorCode: "unsupported_url",
  },
  {
    label: "disallowed non-google host",
    url: "https://google.com.evil/maps",
    expectedErrorCode: "disallowed_hostname",
  },
] as const;
