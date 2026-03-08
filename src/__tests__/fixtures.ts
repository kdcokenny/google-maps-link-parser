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
        { long_name: "Malaz", short_name: "Malaz", types: ["sublocality_level_1"] },
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
