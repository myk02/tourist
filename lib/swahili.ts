/**
 * Swahili survival kit — offline-first phrasebook for tourists.
 * No API, no audio files: pronunciation hints are plain text so the card
 * works in the bush with zero signal.
 */

export interface SwahiliPhrase {
  swahili: string
  english: string
  say: string
  category: 'Greetings' | 'Safari' | 'Money & Food' | 'Help'
}

export const SWAHILI_PHRASES: SwahiliPhrase[] = [
  { swahili: 'Jambo', english: 'Hello', say: 'JAHM-boh', category: 'Greetings' },
  { swahili: 'Habari yako?', english: 'How are you?', say: 'hah-BAH-ree YAH-koh', category: 'Greetings' },
  { swahili: 'Nzuri sana, asante', english: 'Very good, thank you', say: 'nn-ZOO-ree SAH-nah', category: 'Greetings' },
  { swahili: 'Asante sana', english: 'Thank you very much', say: 'ah-SAHN-teh SAH-nah', category: 'Greetings' },
  { swahili: 'Kwaheri', english: 'Goodbye', say: 'kwah-HEH-ree', category: 'Greetings' },
  { swahili: 'Twende safari', english: "Let's go on safari", say: 'TWEN-deh sah-FAH-ree', category: 'Safari' },
  { swahili: 'Simama hapa, tafadhali', english: 'Stop here, please', say: 'see-MAH-mah HAH-pah', category: 'Safari' },
  { swahili: 'Tembo wapi?', english: 'Where are the elephants?', say: 'TEM-boh WAH-pee', category: 'Safari' },
  { swahili: 'Pole pole', english: 'Slowly, slowly', say: 'POH-leh POH-leh', category: 'Safari' },
  { swahili: 'Bei gani?', english: 'How much is it?', say: 'BAY gah-nee', category: 'Money & Food' },
  { swahili: 'Lipa na M-Pesa?', english: 'Can I pay with M-Pesa?', say: 'LEE-pah nah mm-peh-sah', category: 'Money & Food' },
  { swahili: 'Chakula kitamu!', english: 'Delicious food!', say: 'chah-KOO-lah kee-TAH-moo', category: 'Money & Food' },
  { swahili: 'Maji, tafadhali', english: 'Water, please', say: 'MAH-jee', category: 'Money & Food' },
  { swahili: 'Nisaidie, tafadhali!', english: 'Help me, please!', say: 'nee-sah-EE-dee-eh', category: 'Help' },
  { swahili: 'Nimepotea', english: 'I am lost', say: 'nee-meh-poh-TEH-ah', category: 'Help' },
  { swahili: 'Hospitali iko wapi?', english: 'Where is the hospital?', say: 'hos-pee-TAH-lee EE-koh WAH-pee', category: 'Help' },
  { swahili: 'Piga simu polisi!', english: 'Call the police!', say: 'PEE-gah SEE-moo', category: 'Help' },
]

export const SWAHILI_CATEGORIES = ['All', 'Greetings', 'Safari', 'Money & Food', 'Help'] as const
export type SwahiliCategory = (typeof SWAHILI_CATEGORIES)[number]

export function filterPhrases(query: string, category: SwahiliCategory): SwahiliPhrase[] {
  const q = query.trim().toLowerCase()
  return SWAHILI_PHRASES.filter(p => {
    if (category !== 'All' && p.category !== category) return false
    if (!q) return true
    return (
      p.swahili.toLowerCase().includes(q) ||
      p.english.toLowerCase().includes(q)
    )
  })
}
