/**
 * Tour events (SPEC §5, S2.1): small stories between shows, each a choice with
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
    title: 'Tavern stage',
    text: 'A tavern at a crossroads lets anyone play tonight. The regulars have axes.',
    options: [
      { label: 'Play a set: learn a new card', effects: [{ do: 'addCard', rarity: 'common' }] },
      { label: 'Pass the hat: +15 coin', effects: [{ do: 'merch', amount: 15 }] },
    ],
  },
  {
    id: 'promoter',
    title: 'A hooded stranger',
    text: 'A stranger in a hood offers gold up front for a show in a cursed bog.',
    options: [
      { label: 'Take it: +45 coin, lose 4 crowd', effects: [{ do: 'merch', amount: 45 }, { do: 'crowd', amount: -4 }] },
      { label: 'Walk away', effects: [] },
    ],
  },
  {
    id: 'meet-and-greet',
    title: 'Village green',
    text: 'Villagers are waiting by the wagon with flowers and very specific requests.',
    options: [
      { label: 'Hang out: +6 crowd', effects: [{ do: 'crowd', amount: 6 }] },
      { label: 'Sell painted ribbons: +25 coin', effects: [{ do: 'merch', amount: 25 }] },
    ],
  },
  {
    id: 'gear-swap',
    title: 'Wandering merchant',
    text: 'A merchant with a very large backpack offers to trade. Some of it is even enchanted.',
    options: [
      { label: 'Trade: lose a random card, gain a rare one', effects: [{ do: 'removeRandom' }, { do: 'addCard', rarity: 'rare' }] },
      { label: 'Keep your stuff', effects: [] },
    ],
  },
  {
    id: 'request',
    title: 'A royal request',
    text: 'A minor duke wants one more song. Your voice wants honey and a nap.',
    options: [
      { label: 'Play it: lose 3 crowd, gain a signature card', effects: [{ do: 'crowd', amount: -3 }, { do: 'addCard', rarity: 'signature' }] },
      { label: 'Call it a night: +3 crowd', effects: [{ do: 'crowd', amount: 3 }] },
    ],
  },
  {
    id: 'practice',
    title: 'Abandoned chapel',
    text: 'Great acoustics, nobody around. Tighten something up.',
    options: [
      { label: 'Drill a favorite: copy a random card', effects: [{ do: 'duplicateRandom' }] },
      { label: 'Cut the dead weight: remove a random card', effects: [{ do: 'removeRandom' }] },
    ],
  },
  {
    id: 'van',
    title: 'Wagon trouble',
    text: 'A wheel is making a noise that is not in the key of anything.',
    options: [
      { label: 'Pay the wheelwright: -20 coin', effects: [{ do: 'merch', amount: -20 }] },
      { label: 'Push it there yourselves: lose 5 crowd', effects: [{ do: 'crowd', amount: -5 }] },
    ],
  },
];
