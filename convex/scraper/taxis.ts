function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const SERVICE_RATES: Record<string, { perKm: number; base: number; perMin: number; name: string }> = {
  uber: { perKm: 130, base: 100, perMin: 4, name: "Uber" },
  bolt: { perKm: 110, base: 70, perMin: 3, name: "Bolt" },
  little: { perKm: 120, base: 80, perMin: 4, name: "Little Cab" },
  maramoja: { perKm: 125, base: 100, perMin: 3, name: "Maramoja" },
}

const TAXI_SKYLINE = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/960px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg"
const DIANI_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Diani_Beach_Ukunda.jpg/960px-Diani_Beach_Ukunda.jpg"
const NAIVASHA_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Naivasha_lake.jpg/960px-Naivasha_lake.jpg"

function taxiImage(dropoffName: string): string {
  const text = dropoffName.toLowerCase()
  if (text.includes("diani")) return DIANI_IMAGE
  if (text.includes("naivasha")) return NAIVASHA_IMAGE
  return TAXI_SKYLINE
}

export type TaxiEstimate = {
  name: string
  location: string
  price: number
  unit: string
  rating: number
  reviews: number
  image: string
  tags: string[]
  description: string
  lat: number
  lng: number
}

export function estimateTaxiFares(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  pickupName: string,
  dropoffName: string,
): TaxiEstimate[] {
  const distance = haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng)
  const estimatedMin = Math.ceil(distance * 2.5)

  return Object.entries(SERVICE_RATES).map(([key, rate]) => {
    const fare = Math.round(rate.base + distance * rate.perKm + estimatedMin * rate.perMin)

    let rating: number
    let reviews: number
    if (key === "uber") { rating = 4.6; reviews = 25000 }
    else if (key === "bolt") { rating = 4.4; reviews = 18000 }
    else if (key === "little") { rating = 4.5; reviews = 8000 }
    else { rating = 4.3; reviews = 3000 }

    return {
      name: `${rate.name}: ${pickupName} → ${dropoffName}`,
      location: `${pickupName} → ${dropoffName}, Kenya`,
      price: fare,
      unit: "ride",
      rating,
      reviews,
      image: taxiImage(dropoffName),
      tags: [rate.name, `${distance.toFixed(0)} km`, `${estimatedMin} min`],
      description: `Estimated ${rate.name} fare from ${pickupName} to ${dropoffName}. ${distance.toFixed(1)} km, approximately ${estimatedMin} minutes. Price is an estimate and may vary due to traffic, surge pricing, and time of day.`,
      lat: pickupLat,
      lng: pickupLng,
    }
  })
}

export function estimateTaxiFromQuery(query: string): TaxiEstimate[] {
  const routes: Record<string, { pickup: [number, number, string]; dropoff: [number, number, string] }> = {
    "JKIA Nairobi": { pickup: [-1.3192, 36.9278, "JKIA"], dropoff: [-1.2864, 36.8172, "Nairobi CBD"] },
    "Nairobi JKIA": { pickup: [-1.2864, 36.8172, "Nairobi CBD"], dropoff: [-1.3192, 36.9278, "JKIA"] },
    "JKIA Westlands": { pickup: [-1.3192, 36.9278, "JKIA"], dropoff: [-1.2641, 36.8046, "Westlands"] },
    "JKIA Mombasa Road": { pickup: [-1.3192, 36.9278, "JKIA"], dropoff: [-1.3300, 36.8700, "Mombasa Road"] },
    "Nairobi Mombasa": { pickup: [-1.2864, 36.8172, "Nairobi"], dropoff: [-4.0435, 39.6682, "Mombasa"] },
    "Nairobi Naivasha": { pickup: [-1.2864, 36.8172, "Nairobi"], dropoff: [-0.7172, 36.4310, "Naivasha"] },
    "Nairobi Diani": { pickup: [-1.2864, 36.8172, "Nairobi"], dropoff: [-4.2792, 39.5947, "Diani Beach"] },
    "Mombasa Diani": { pickup: [-4.0347, 39.5942, "Mombasa Airport"], dropoff: [-4.2792, 39.5947, "Diani Beach"] },
    "Wilson Nairobi": { pickup: [-1.3217, 36.8148, "Wilson Airport"], dropoff: [-1.2864, 36.8172, "Nairobi CBD"] },
    "Nairobi Karen": { pickup: [-1.2864, 36.8172, "Nairobi"], dropoff: [-1.3100, 36.7200, "Karen"] },
  }

  const q = query.toLowerCase()
  const route = Object.entries(routes).find(([key]) =>
    key.toLowerCase().includes(q) || q.includes(key.toLowerCase().split(" ")[0])
  )

  if (route) {
    const [, data] = route
    return estimateTaxiFares(
      data.pickup[0], data.pickup[1],
      data.dropoff[0], data.dropoff[1],
      data.pickup[2], data.dropoff[2],
    )
  }

  return estimateTaxiFares(
    -1.2864, 36.8172, -1.3192, 36.9278,
    "Nairobi CBD", "JKIA",
  )
}
