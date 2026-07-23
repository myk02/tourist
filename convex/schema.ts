import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({ clerkId: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.optional(v.boolean()), image: v.optional(v.string()), trackingConsent: v.optional(v.boolean()), createdAt: v.optional(v.number()), updatedAt: v.optional(v.number()) }).index("by_clerk", ["clerkId"]),
  trips: defineTable({ ownerId: v.string(), name: v.string(), destination: v.string(), startDate: v.string(), endDate: v.string(), budget: v.number(), totalCost: v.number(), status: v.string(), coverImage: v.optional(v.string()) }).index("by_owner", ["ownerId"]),
  tripStops: defineTable({ tripId: v.id("trips"), name: v.string(), place: v.string(), day: v.number(), time: v.string(), cost: v.number(), kind: v.string(), order: v.number(), lat: v.optional(v.number()), lng: v.optional(v.number()) }).index("by_trip", ["tripId"]),
  bookings: defineTable({ ownerId: v.string(), tripId: v.optional(v.id("trips")), stopId: v.optional(v.id("tripStops")), listingId: v.string(), type: v.string(), amount: v.number(), status: v.string(), paymentMethod: v.string(), reference: v.string() }).index("by_owner", ["ownerId"]).index("by_trip", ["tripId"]),
  positions: defineTable({ tripId: v.id("trips"), ownerId: v.string(), lat: v.number(), lng: v.number(), accuracy: v.number(), recordedAt: v.number() }).index("by_trip_time", ["tripId", "recordedAt"]),
  moments: defineTable({ tripId: v.id("trips"), ownerId: v.string(), caption: v.string(), storageId: v.optional(v.id("_storage")), stopName: v.optional(v.string()), createdAt: v.number(), public: v.boolean() }).index("by_trip", ["tripId"]),
  listings: defineTable({
    vertical: v.string(),
    name: v.string(),
    location: v.string(),
    price: v.number(),
    unit: v.string(),
    rating: v.number(),
    reviews: v.number(),
    image: v.string(),
    tags: v.array(v.string()),
    description: v.string(),
    lat: v.number(),
    lng: v.number(),
    scrapedAt: v.optional(v.number()),
    source: v.optional(v.string()),
  }).index("by_vertical", ["vertical"]).index("by_location", ["location"]).index("by_vertical_scraped", ["vertical", "scrapedAt"]),
})
