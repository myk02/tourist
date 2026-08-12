import { describe, expect, it } from 'vitest'
import { formatKES, wikimediaThumb } from './kenya-data'

describe('wikimediaThumb', () => {
  it('rewrites a full-size original to a 960px thumb', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Angama_Mara_2018_086.jpg'
    expect(wikimediaThumb(url)).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Angama_Mara_2018_086.jpg/960px-Angama_Mara_2018_086.jpg')
  })

  it('rewrites an invalid 800px thumb to a valid 960px thumb', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Giraffe_Centre_August_2025_04.jpg/800px-Giraffe_Centre_August_2025_04.jpg'
    expect(wikimediaThumb(url)).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Giraffe_Centre_August_2025_04.jpg/960px-Giraffe_Centre_August_2025_04.jpg')
  })

  it('handles percent-encoded filenames', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png/800px-2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png'
    expect(wikimediaThumb(url)).toContain('/960px-2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png')
  })

  it('honors a custom width', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/2/2d/Diani_Beach_Ukunda.jpg'
    expect(wikimediaThumb(url, 480)).toContain('/480px-Diani_Beach_Ukunda.jpg')
  })

  it('strips query strings before rewriting', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Angama_Mara_2018_086.jpg?download=1'
    expect(wikimediaThumb(url)).toContain('/960px-Angama_Mara_2018_086.jpg')
  })

  it('leaves non-wikimedia URLs untouched', () => {
    expect(wikimediaThumb('/kenya-hero.png')).toBe('/kenya-hero.png')
    expect(wikimediaThumb('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg')
    expect(wikimediaThumb('')).toBe('')
  })
})

describe('formatKES', () => {
  // Assertions avoid an exact string match because ICU can render the currency
  // separator as a non-breaking space and symbol spacing varies by environment.
  it('formats whole shillings with grouping', () => {
    const out = formatKES(12345)
    expect(out).toMatch(/KSh/)
    expect(out).toContain('12,345')
  })

  it('formats zero', () => {
    const out = formatKES(0)
    expect(out).toMatch(/KSh/)
    expect(out).toContain('0')
  })

  it('formats large budgets', () => {
    const out = formatKES(135000)
    expect(out).toMatch(/KSh/)
    expect(out).toContain('135,000')
  })
})
