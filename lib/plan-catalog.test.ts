import { describe, expect, it } from 'vitest'
import { resolvePlannerCandidates, type CatalogListing } from './plan-catalog'

const listing: CatalogListing = {
  _id: 'listing_1',
  vertical: 'stays',
  name: 'Lake Naivasha Lodge',
  location: 'Naivasha',
  price: 8500,
  unit: 'night',
  rating: 4.7,
  reviews: 126,
  tags: ['lake', 'wildlife'],
  description: 'A lakeside stay near Naivasha.',
  lat: -0.72,
  lng: 36.43,
  image: 'https://example.com/lodge.jpg',
}

describe('resolvePlannerCandidates', () => {
  it('uses authoritative listing details and preserves requested order', () => {
    expect(resolvePlannerCandidates(['listing_1'], [listing])).toEqual([{
      id: 'listing_1',
      vertical: 'stays',
      name: 'Lake Naivasha Lodge',
      location: 'Naivasha',
      price: 8500,
      unit: 'night',
      rating: 4.7,
      reviews: 126,
      tags: ['lake', 'wildlife'],
      description: 'A lakeside stay near Naivasha.',
      lat: -0.72,
      lng: 36.43,
      image: 'https://example.com/lodge.jpg',
    }])
  })

  it('drops unknown IDs and duplicate IDs', () => {
    expect(resolvePlannerCandidates(['missing', 'listing_1', 'listing_1'], [listing])).toHaveLength(1)
  })
})
