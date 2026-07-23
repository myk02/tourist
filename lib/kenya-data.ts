export type Vertical = "stays" | "flights" | "things-to-do" | "attractions" | "cars" | "taxis"

export type Listing = {
  _id: string
  vertical: string
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

export const categories: { id: Vertical; label: string }[] = [
  { id: "stays", label: "Stays" },
  { id: "flights", label: "Flights" },
  { id: "things-to-do", label: "Things to do" },
  { id: "attractions", label: "Attractions" },
  { id: "cars", label: "Cars" },
  { id: "taxis", label: "Taxis" },
]

export const itinerary = [
  { day: 1, time: "09:00", title: "Arrive & settle into Nairobi", place: "Westlands, Nairobi", cost: 14200, kind: "Stay" },
  { day: 2, time: "07:00", title: "Drive to the Maasai Mara", place: "Narok County", cost: 12500, kind: "Transport" },
  { day: 2, time: "15:30", title: "Golden-hour game drive", place: "Mara Triangle", cost: 6200, kind: "Experience" },
  { day: 3, time: "06:00", title: "Sunrise over the savannah", place: "Mara River", cost: 4800, kind: "Experience" },
]

export function formatKES(value: number) { return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value) }

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000
export const totalCost = itinerary.reduce((sum, stop) => sum + stop.cost, 0)
