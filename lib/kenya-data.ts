export type Vertical = "stays" | "flights" | "attractions" | "cars" | "taxis"

export type Listing = {
  id: string
  vertical: Vertical
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
  { id: "stays", label: "Stays" }, { id: "flights", label: "Flights" },
  { id: "attractions", label: "Things to do" }, { id: "cars", label: "Cars" },
  { id: "taxis", label: "Taxis" },
]

export const listings: Listing[] = [
  { id: "maasai-mara-camp", vertical: "stays", name: "Mara River Camp", location: "Maasai Mara, Narok", price: 24800, unit: "night", rating: 4.9, reviews: 318, image: "/kenya-hero.png", tags: ["River view", "Breakfast included"], description: "Canvas suites tucked along the Mara River, with guided game drives and fireside dinners under the stars.", lat: -1.4935, lng: 35.1439 },
  { id: "diani-house", vertical: "stays", name: "Diani Palm House", location: "Diani Beach, Kwale", price: 14500, unit: "night", rating: 4.8, reviews: 206, image: "/diani-beach.jpg", tags: ["Beachfront", "Pool"], description: "A breezy coastal hideaway steps from the Indian Ocean, surrounded by palms and white sand.", lat: -4.2792, lng: 39.5947 },
  { id: "naivasha-lodge", vertical: "stays", name: "Naivasha Lake Lodge", location: "Lake Naivasha, Nakuru", price: 11800, unit: "night", rating: 4.7, reviews: 184, image: "/naivasha-lake.jpg", tags: ["Lake view", "Boat tours"], description: "Quiet cottages on the lakeshore with sunrise boat rides and easy access to Hell's Gate.", lat: -0.7172, lng: 36.4310 },
  { id: "nbo-mba", vertical: "flights", name: "Nairobi to Mombasa", location: "NBO → MBA · Kenya Airways", price: 8350, unit: "one way", rating: 4.6, reviews: 820, image: "/kenya-hero.png", tags: ["1h 05m", "Direct"], description: "A quick direct hop from Nairobi to the coast with one cabin bag included.", lat: -1.3192, lng: 36.9278 },
  { id: "mara-drive", vertical: "attractions", name: "Sunrise Mara Game Drive", location: "Maasai Mara, Narok", price: 6200, unit: "person", rating: 4.9, reviews: 542, image: "/kenya-hero.png", tags: ["6 hours", "Expert guide"], description: "Track lions, elephants and wildebeest at first light with a local naturalist.", lat: -1.4061, lng: 35.0127 },
  { id: "fort-jesus", vertical: "attractions", name: "Fort Jesus & Old Town Walk", location: "Mombasa Island", price: 1800, unit: "person", rating: 4.7, reviews: 391, image: "/diani-beach.jpg", tags: ["3 hours", "Local guide"], description: "Explore centuries of Swahili history, carved doors, spice markets and the iconic fort.", lat: -4.0624, lng: 39.6790 },
  { id: "safari-cruiser", vertical: "cars", name: "Safari-ready Land Cruiser", location: "Pickup in Nairobi", price: 12500, unit: "day", rating: 4.8, reviews: 96, image: "/kenya-hero.png", tags: ["4×4", "Unlimited km"], description: "A fully equipped 4×4 with rooftop tent option and 24-hour roadside support.", lat: -1.2864, lng: 36.8172 },
  { id: "airport-transfer", vertical: "taxis", name: "JKIA private transfer", location: "JKIA → Nairobi", price: 2800, unit: "ride", rating: 4.8, reviews: 615, image: "/kenya-hero.png", tags: ["Meet & greet", "Fixed fare"], description: "Private airport pickup with flight tracking and a professional local driver.", lat: -1.3192, lng: 36.9278 },
]

export const itinerary = [
  { day: 1, time: "09:00", title: "Arrive & settle into Nairobi", place: "Westlands, Nairobi", cost: 14200, kind: "Stay" },
  { day: 2, time: "07:00", title: "Drive to the Maasai Mara", place: "Narok County", cost: 12500, kind: "Transport" },
  { day: 2, time: "15:30", title: "Golden-hour game drive", place: "Mara Triangle", cost: 6200, kind: "Experience" },
  { day: 3, time: "06:00", title: "Sunrise over the savannah", place: "Mara River", cost: 4800, kind: "Experience" },
]

export function formatKES(value: number) { return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value) }
export const totalCost = itinerary.reduce((sum, stop) => sum + stop.cost, 0)
