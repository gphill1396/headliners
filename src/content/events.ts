/**
 * Tour events (SPEC §5, S2.1): small stories between gigs, each a choice with
 * a trade-off. Effects are data, applied by engine/tour.ts.
 */
export type TourEffect =
  | { do: 'merch'; amount: number }
  | { do: 'crowd'; amount: number }
  | { do: 'addCard'; rarity: 'common' | 'rare' | 'signature' }
  | { do: 'removeRandom' }
  | { do: 'duplicateRandom' };

export interface TourEventDef {
  id: string;
  title: string;
  text: string;
  options: [TourEventOption, TourEventOption];
}

export interface TourEventOption {
  label: string;
  effects: TourEffect[];
}

export const TOUR_EVENTS: TourEventDef[] = [
  {
    id: 'open-mic',
    title: 'Open mic',
    text: 'A dive bar has an open mic tonight. The regulars look tough to please.',
    options: [
      { label: 'Play a set: learn a new card', effects: [{ do: 'addCard', rarity: 'common' }] },
      { label: 'Pass the hat: +15 merch', effects: [{ do: 'merch', amount: 15 }] },
    ],
  },
  {
    id: 'promoter',
    title: 'Shady promoter',
    text: 'A promoter offers cash up front for a gig that sounds like a mistake.',
    options: [
      { label: 'Take it: +45 merch, lose 4 crowd', effects: [{ do: 'merch', amount: 45 }, { do: 'crowd', amount: -4 }] },
      { label: 'Walk away', effects: [] },
    ],
  },
  {
    id: 'meet-and-greet',
    title: 'Meet and greet',
    text: 'Fans are waiting by the van with markers and very specific requests.',
    options: [
      { label: 'Hang out: +6 crowd', effects: [{ do: 'crowd', amount: 6 }] },
      { label: 'Sell signed posters: +25 merch', effects: [{ do: 'merch', amount: 25 }] },
    ],
  },
  {
    id: 'gear-swap',
    title: 'Gear swap',
    text: 'Another band offers to trade gear. Some of it is even working.',
    options: [
      { label: 'Trade: lose a random card, gain a rare one', effects: [{ do: 'removeRandom' }, { do: 'addCard', rarity: 'rare' }] },
      { label: 'Keep your stuff', effects: [] },
    ],
  },
  {
    id: 'request',
    title: 'Encore request',
    text: 'The crowd wants one more. Your voice wants a lozenge.',
    options: [
      { label: 'Play it: lose 3 crowd, gain a signature card', effects: [{ do: 'crowd', amount: -3 }, { do: 'addCard', rarity: 'signature' }] },
      { label: 'Call it a night: +3 crowd', effects: [{ do: 'crowd', amount: 3 }] },
    ],
  },
  {
    id: 'practice',
    title: 'Practice space',
    text: 'A free afternoon in a rented room. Tighten something up.',
    options: [
      { label: 'Drill a favorite: copy a random card', effects: [{ do: 'duplicateRandom' }] },
      { label: 'Cut the dead weight: remove a random card', effects: [{ do: 'removeRandom' }] },
    ],
  },
  {
    id: 'van',
    title: 'Van trouble',
    text: 'Something under the hood is making a noise that is not in the key of anything.',
    options: [
      { label: 'Pay the mechanic: -20 merch', effects: [{ do: 'merch', amount: -20 }] },
      { label: 'Push it there yourselves: lose 5 crowd', effects: [{ do: 'crowd', amount: -5 }] },
    ],
  },
];
