export interface VerticalConfig {
  searchQueries: string[]
  resultsPerQuery: number
  extractPrompt: string
  schema: {
    type: "object"
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>
    required: string[]
  }
}

const SHARED_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    location: { type: "string" },
    price: { type: "number" },
    unit: { type: "string" },
    rating: { type: "number" },
    reviews: { type: "number" },
    image: { type: "string", description: "Primary listing image URL" },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    lat: { type: "number" },
    lng: { type: "number" },
  },
  required: ["name", "location", "price", "description"],
}

export const VERTICAL_CONFIG: Record<string, VerticalConfig> = {
  stays: {
    searchQueries: [
      "site:booking.com hotels Nairobi Kenya with prices per night KES",
      "site:booking.com hotels Diani Kenya with prices per night KES",
      "site:booking.com hotels Mombasa Kenya with prices per night KES",
      "site:booking.com lodges Maasai Mara Kenya with prices per night KES",
      "site:booking.com hotels Naivasha Kenya with prices per night KES",
      "site:booking.com hotels Nakuru Kenya with prices per night KES",
    ],
    resultsPerQuery: 20,
    extractPrompt: "Extract every hotel, lodge, or resort from the page. For each: property name, city/area in Kenya, nightly price in KES, star rating, review count, a primary image URL, 3-5 short tags (e.g. Beachfront, Safari, Luxury), and a 1-2 sentence description. Include coordinates if visible.",
    schema: SHARED_SCHEMA,
  },
  flights: {
    searchQueries: [
      "site:skyscanner.net OR site:jambojet.com flights Nairobi Mombasa Kenya fares",
      "site:skyscanner.net OR site:jambojet.com flights Nairobi Kisumu Kenya fares",
      "site:skyscanner.net OR site:jambojet.com flights Nairobi Malindi Kenya fares",
      "site:skyscanner.net OR site:jambojet.com flights Nairobi Lamu Kenya fares",
      "site:skyscanner.net OR site:jambojet.com flights Nairobi Eldoret Kenya fares",
    ],
    resultsPerQuery: 20,
    extractPrompt: "Extract every domestic flight route in Kenya from the page. For each: route name (e.g. Nairobi to Mombasa), airports (departure → arrival), one-way fare in KES, airline name, flight duration, a primary image URL, 2-3 tags, and a short description. Include coordinates of the departure airport if shown.",
    schema: SHARED_SCHEMA,
  },
  "things-to-do": {
    searchQueries: [
      "site:getyourguide.com OR site:viator.com tours activities Nairobi Kenya prices",
      "site:getyourguide.com OR site:viator.com tours activities Maasai Mara Kenya prices",
      "site:getyourguide.com OR site:viator.com tours activities Diani Mombasa Kenya prices",
      "site:getyourguide.com OR site:viator.com tours activities Naivasha Nakuru Kenya prices",
      "site:getyourguide.com OR site:viator.com tours activities Amboseli Kenya prices",
    ],
    resultsPerQuery: 20,
    extractPrompt: "Extract every tour, activity, or experience in Kenya from the page. For each: activity name, city/region in Kenya, price per person in KES, rating, review count, a primary image URL, 3-5 short tags (e.g. Safari, Snorkeling, Cultural), and a 1-2 sentence description. Include coordinates if shown.",
    schema: SHARED_SCHEMA,
  },
  attractions: {
    searchQueries: [
      "site:tripadvisor.com OR site:lonelyplanet.com things to do Nairobi Kenya attractions",
      "site:tripadvisor.com OR site:lonelyplanet.com things to do Maasai Mara Kenya attractions",
      "site:tripadvisor.com OR site:lonelyplanet.com things to do Mombasa Diani Kenya attractions",
      "site:tripadvisor.com OR site:lonelyplanet.com things to do Naivasha Nakuru Kenya attractions",
      "site:tripadvisor.com OR site:lonelyplanet.com national parks Kenya entry fees attractions",
    ],
    resultsPerQuery: 20,
    extractPrompt: "Extract every attraction, national park, landmark, or tourist site in Kenya from the page. For each: attraction name, location in Kenya, entry fee in KES, rating, review count, a primary image URL, 2-4 tags, and a short description. Include coordinates if shown.",
    schema: SHARED_SCHEMA,
  },
  cars: {
    searchQueries: [
      "site:rentalcars.com OR site:expedia.com car rental Nairobi Kenya daily rates",
      "site:rentalcars.com OR site:expedia.com car rental Mombasa Kenya daily rates",
      "site:rentalcars.com OR site:expedia.com car rental Kisumu Kenya daily rates",
      "site:rentalcars.com OR site:expedia.com 4x4 safari vehicle rental Kenya daily rates",
    ],
    resultsPerQuery: 20,
    extractPrompt: "Extract every car rental option in Kenya from the page. For each: car model or rental name, pickup city in Kenya, daily rental price in KES, rating, review count, a primary image URL, 2-4 tags (e.g. SUV, Economy, 4x4), and a short description. Include coordinates of the pickup location if shown.",
    schema: SHARED_SCHEMA,
  },
}
