import type { Stop } from '@/components/kenyatrace/types'

/**
 * Read-only 7-day "Classic Kenya Safari & Coast Trace" shown to guests before
 * they create an account — proof that KenyaTrace turns a real brief into a
 * day-by-day, budgeted, mapped itinerary.
 *
 * Route: Nairobi → Lake Naivasha → Maasai Mara → Diani Beach.
 */
export const SAMPLE_TRACE = {
  name: 'Classic Kenya Safari & Coast Trace',
  destination: 'Nairobi · Lake Naivasha · Maasai Mara · Diani Beach',
  summary:
    'Seven days across Kenya’s greatest hits: a city safari in Nairobi, Rift Valley lakes and canyons, two nights under the Mara’s big skies, then fly to the Indian Ocean for a soft-landing finish in Diani.',
  budget: 260000,
  days: 7,
  stops: [
    // ─── Day 1 · Nairobi ────────────────────────────────────────
    { day: 1, time: '12:00', title: 'Arrive at JKIA & settle into Westlands', place: 'Westlands, Nairobi', cost: 16500, kind: 'Stay', lat: -1.2864, lng: 36.8172, reason: 'Start in Nairobi’s business district — easy airport access and a short hop to your first park.', duration: 1440 },
    { day: 1, time: '16:00', title: 'Nairobi National Park sunset drive', place: 'Nairobi National Park', cost: 1500, kind: 'Experience', lat: -1.3861, lng: 36.8425, reason: 'The world’s only capital-city park — lions and rhinos against the skyline, no full-day detour needed.', duration: 180 },
    { day: 1, time: '20:00', title: 'Dinner at a Westlands rooftop', place: 'Westlands, Nairobi', cost: 2500, kind: 'Food', lat: -1.2641, lng: 36.8046, reason: 'A relaxed first evening with Nairobi’s best kitchen scene.', duration: 90 },
    // ─── Day 2 · Lake Naivasha ──────────────────────────────────
    { day: 2, time: '08:00', title: 'Drive the Rift Valley escarpment', place: 'Nairobi → Lake Naivasha', cost: 4500, kind: 'Transport', lat: -1.2864, lng: 36.8172, reason: 'A scenic 90-minute drive down the escarpment to the lakes.', duration: 120 },
    { day: 2, time: '11:00', title: 'Hells Gate cycling safari', place: 'Lake Naivasha, Nakuru', cost: 800, kind: 'Experience', lat: -0.8833, lng: 36.3167, reason: 'Pedal between zebras and giraffes in the gorge that inspired The Lion King.', duration: 180 },
    { day: 2, time: '15:30', title: 'Check in at a lakeside resort', place: 'Lake Naivasha, Nakuru', cost: 16800, kind: 'Stay', lat: -0.7533, lng: 36.4398, reason: 'Full-board lakeside comfort with hippos calling overnight.', duration: 1440 },
    { day: 2, time: '17:30', title: 'Boat ride past hippos & fish eagles', place: 'Lake Naivasha', cost: 2000, kind: 'Experience', lat: -0.7533, lng: 36.4398, reason: 'Golden-hour water safari along the lake’s papyrus-fringed shore.', duration: 90 },
    // ─── Day 3 · Maasai Mara ────────────────────────────────────
    { day: 3, time: '07:00', title: 'Drive into the Maasai Mara', place: 'Naivasha → Maasai Mara', cost: 12500, kind: 'Transport', lat: -0.8833, lng: 36.3167, reason: 'The classic bumpy safari road across the Mara plains.', duration: 300 },
    { day: 3, time: '15:30', title: 'Golden-hour game drive', place: 'Mara Triangle, Maasai Mara', cost: 6200, kind: 'Experience', lat: -1.5000, lng: 35.1500, reason: 'First game drive as the light turns — big cats and wildebeest at their most active.', duration: 180 },
    { day: 3, time: '18:00', title: 'Night at a luxury Mara tent', place: 'Maasai Mara, Narok', cost: 35000, kind: 'Stay', lat: -1.4013, lng: 35.1329, reason: 'A canvas lodge under the stars, a short drive from the reserve gates.', duration: 1440 },
    // ─── Day 4 · Maasai Mara ────────────────────────────────────
    { day: 4, time: '06:00', title: 'Sunrise over the savannah', place: 'Mara River', cost: 4800, kind: 'Experience', lat: -1.4667, lng: 35.0833, reason: 'First light at the Mara River — the heart of the Great Migration crossing.', duration: 240 },
    { day: 4, time: '12:30', title: 'Maasai village & cultural visit', place: 'Maasai Mara, Narok', cost: 1500, kind: 'Experience', lat: -1.5000, lng: 35.1500, reason: 'Meet the Maasai community and learn how they live alongside the wildlife.', duration: 120 },
    { day: 4, time: '16:00', title: 'Afternoon predator search', place: 'Mara Triangle, Maasai Mara', cost: 6200, kind: 'Experience', lat: -1.4500, lng: 35.0833, reason: 'Track lions, cheetahs and leopards across the reserve’s open plains.', duration: 180 },
    { day: 4, time: '20:00', title: 'Bush dinner at the camp', place: 'Maasai Mara, Narok', cost: 3500, kind: 'Food', lat: -1.4013, lng: 35.1329, reason: 'A lantern-lit dinner under a sky full of southern stars.', duration: 90 },
    // ─── Day 5 · Diani Beach ────────────────────────────────────
    { day: 5, time: '08:00', title: 'Bush flight to Mombasa', place: 'Olkiombo (OLX) → Mombasa (MBA)', cost: 32000, kind: 'Transport', lat: -1.3217, lng: 36.8148, reason: 'Skip the 7-hour drive — a short hop in a small plane over the Rift Valley.', duration: 120 },
    { day: 5, time: '14:00', title: 'Coastal transfer to Diani', place: 'Moi Intl → Diani Beach', cost: 10000, kind: 'Transport', lat: -4.0347, lng: 39.5942, reason: 'Private transfer across the Likoni channel to the south coast.', duration: 90 },
    { day: 5, time: '16:00', title: 'Check in at a beachfront resort', place: 'Diani Beach, Kwale', cost: 24000, kind: 'Stay', lat: -4.2695, lng: 39.5863, reason: 'White sands and warm water after four days of safari dust.', duration: 1440 },
    { day: 5, time: '19:00', title: 'Seafood dinner on the beach', place: 'Diani Beach, Kwale', cost: 3000, kind: 'Food', lat: -4.2760, lng: 39.5905, reason: 'Fresh coastal catch with your toes in the sand.', duration: 90 },
    // ─── Day 6 · Diani Beach ────────────────────────────────────
    { day: 6, time: '09:00', title: 'Snorkel the coral gardens', place: 'Diani Reef, Kwale', cost: 4800, kind: 'Experience', lat: -4.3100, lng: 39.6050, reason: 'Dhow trip over the reef — turtles and technicolour fish.', duration: 180 },
    { day: 6, time: '15:00', title: 'Kitesurfing or a lazy beach day', place: 'Diani Beach, Kwale', cost: 6000, kind: 'Experience', lat: -4.2695, lng: 39.5863, reason: 'Choose your pace: lesson on the water or hammock time under a palm.', duration: 180 },
    { day: 6, time: '19:30', title: 'Sunset dhow cruise', place: 'Diani Beach, Kwale', cost: 4000, kind: 'Experience', lat: -4.2833, lng: 39.5667, reason: 'Sail the reef as the sun drops into the Indian Ocean.', duration: 120 },
    // ─── Day 7 · Depart ─────────────────────────────────────────
    { day: 7, time: '09:00', title: 'Morning swim before departure', place: 'Diani Beach, Kwale', cost: 0, kind: 'Experience', lat: -4.2695, lng: 39.5863, reason: 'One last dip in the warm Indian Ocean.', duration: 60 },
    { day: 7, time: '11:00', title: 'Transfer to Moi International', place: 'Diani Beach → Mombasa (MBA)', cost: 10000, kind: 'Transport', lat: -4.2695, lng: 39.5863, reason: 'Head for the airport relaxed and on time.', duration: 120 },
  ],
} satisfies { name: string; destination: string; summary: string; budget: number; days: number; stops: Stop[] }

export function sampleTraceCosts(stops: Stop[]) {
  const byKind = new Map<string, number>()
  const byDay = new Map<number, number>()
  for (const s of stops) {
    byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + s.cost)
    byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.cost)
  }
  const total = stops.reduce((sum, s) => sum + s.cost, 0)
  return {
    total,
    byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]),
    byDay: [...byDay.entries()].sort((a, b) => a[0] - b[0]),
  }
}
