import type { CardDef, Effect, Keyword, Trigger } from '../engine/types';

/**
 * Rules text generated from a card's effect data (SPEC §6), so the words on a
 * card can't drift from what it does. A card's `note` adds anything the data
 * can't say on its own.
 */
export function cardText(def: CardDef): string {
  const parts: string[] = [];
  switch (def.type) {
    case 'unit': {
      const u = def.unit!;
      let s = `Unit. ${u.damage} damage, fires ${fireRate(u.fireEvery)}.`;
      if (u.pierce) s += ` Pierce ${u.pierce}.`;
      if (u.splash) s += ' Splash.';
      if (u.antiAir) s += ' Anti-Air: its shots hit flyers.';
      if (u.priority) s += ' Priority: its shots fly past other enemies to hit Trolls, Hags, Shamans and bosses first.';
      if (u.lifespanBeats) s += ` Leaves after ${u.lifespanBeats} beats.`;
      parts.push(s);
      break;
    }
    case 'gate': {
      const g = def.gate!;
      parts.push(`Gate. ${gateEffect(g.kind, g.amount)} Lasts ${g.durability} shots.`);
      break;
    }
    case 'riff':
      parts.push(`Riff.${def.cost === 0 ? ' Free.' : ''} ${effectsText(def.onPlay ?? [])}`);
      break;
    case 'amp':
      parts.push('Amp.');
      break;
  }
  for (const t of def.triggers ?? []) parts.push(triggerText(t, def.type === 'unit'));
  if (def.echo) parts.push('Echo: happens again next beat.');
  if (def.note) parts.push(def.note);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** One-line definitions for the long-press card view. */
export const KEYWORD_TEXT: Record<Keyword, string> = {
  pierce: 'Pierce: a shot passes through extra enemies.',
  splash: 'Splash: half damage to enemies near the hit.',
  echo: 'Echo: the card happens again on the next beat.',
  downbeat: 'Downbeat: something extra on beat 1 of the bar.',
  encore: 'Encore: a bonus while your chain is 3 or longer.',
  feedback: 'Feedback: strong, but costs you crowd.',
  antiAir: 'Anti-Air: hits Harpies and other flyers.',
  roadie: 'Squire: a small unit that leaves after 8 beats.',
  shred: 'Tinker: shots ignore armor and get past shields.',
  priority: 'Priority: goes for Trolls, Hags, Shamans and bosses first.',
  speaker: 'Horn: turns shots into the next lane over, from the side.',
  volume: 'Volume: a unit that keeps getting stronger, up to +20.',
  slow: 'Slow: enemies move at part speed for a few beats.',
};

function fireRate(every: number): string {
  if (every === 1) return 'every eighth note';
  if (every === 2) return 'every beat';
  return `every ${every / 2} beats`;
}

function gateEffect(kind: NonNullable<CardDef['gate']>['kind'], amount: number): string {
  switch (kind) {
    case 'copy':
      return `Each shot through it becomes ${amount}.`;
    case 'damage':
      return `+${amount} damage to each shot through it.`;
    case 'splash':
      return 'Shots through it gain Splash.';
    case 'pierce':
      return `Shots through it gain Pierce ${amount}.`;
    case 'shred':
      return 'Shots through it ignore armor and get past Hobgoblin shields.';
    case 'aim':
      return 'A horn: shots through it turn into the next lane over (from the middle, alternating left and right), and side shots get past Hobgoblin shields.';
    case 'lift':
      return 'Shots through it gain Anti-Air.';
    case 'slow':
      return 'Shots through it slow what they hit to half speed for 2 beats.';
  }
}

function triggerText(t: Trigger, onUnit: boolean): string {
  const only = t.effects.length === 1 ? t.effects[0]! : null;
  if (only?.do === 'volume' && t.when === 'downbeat') return `Volume: +${only.amount} damage for good on every beat 1 (up to +20).`;
  const what = effectsText(t.effects, onUnit);
  const link = t.link ? ', and the chain gains a link' : '';
  if (t.when === 'downbeat') return `On every beat 1: ${lower(what).replace(/\.$/, '')}${link}.`;
  return `Whenever the chain grows: ${lower(what).replace(/\.$/, '')}${link}.`;
}

function effectsText(effects: readonly Effect[], onUnit = false): string {
  // Plain effects join into one sentence ("Gain 1 energy and gates in this lane regain 10 durability.");
  // conditions and Feedback get sentences of their own.
  const separate = (e: Effect) => e.do === 'ifChain' || e.do === 'ifDownbeat' || e.do === 'loseCrowd';
  const plain = effects.filter((e) => !separate(e)).map((e) => effectText(e, onUnit));
  const out: string[] = [];
  if (plain.length > 0) out.push(plain.length === 1 ? plain[0]! : `${plain.slice(0, -1).join(', ')} and ${lower(plain[plain.length - 1]!)}`);
  for (const e of effects.filter(separate)) out.push(effectText(e, onUnit));
  return out.map((s) => `${s}.`.replace(/\.\.$/, '.')).join(' ');
}

/** If two single-effect branches differ only in one number, the number that changed ("90", "4 extra shots"). */
function onlyAmountDiffers(then: readonly Effect[], otherwise: readonly Effect[] | undefined): string | null {
  if (!otherwise || then.length !== 1 || otherwise.length !== 1) return null;
  const a = then[0]!;
  const b = otherwise[0]!;
  if (a.do !== b.do) return null;
  const strip = (e: Effect) => JSON.stringify({ ...e, amount: 0, shots: 0 });
  if (strip(a) !== strip(b)) return null;
  if ('amount' in a && 'amount' in b && a.amount !== b.amount) return `${a.amount}`;
  if (a.do === 'volley' && b.do === 'volley' && a.shots !== b.shots) return `${a.shots} extra shots`;
  return null;
}

function effectText(e: Effect, onUnit: boolean): string {
  switch (e.do) {
    case 'slow':
      return `Slow ${e.scope === 'all' ? 'every enemy' : 'every enemy in this lane'} to ${e.pct}% speed for ${e.beats} beats`;
    case 'heal':
      return `Win back ${e.amount} crowd`;
    case 'damageFront':
      return e.prefer === 'priority'
        ? `Deal ${e.amount} to a Troll, Hag, Shaman or boss in this lane, or else the enemy closest to the stage`
        : `Deal ${e.amount} to the enemy closest to the stage in this lane`;
    case 'damageLane':
      return `Deal ${e.amount} to every enemy in this lane`;
    case 'damageAll':
      return `Deal ${e.amount} to every ${e.only === 'flying' ? 'flying enemy' : 'enemy'}`;
    case 'volley': {
      const who = e.tokensOnly ? 'Every Squire' : e.scope === 'lane' ? 'Units in this lane' : 'Every unit';
      const fire = e.tokensOnly || e.scope !== 'lane' ? 'fires' : 'fire';
      return `${who} ${fire} ${e.shots === 1 ? 'an extra shot' : `${e.shots} extra shots`}`;
    }
    case 'roadie':
      return `Put ${e.count === 1 ? 'a Squire' : `${e.count} Squires`} on stage ${e.scope === 'all' ? 'in every lane' : 'in this lane'}`;
    case 'repairGates':
      return e.scope === 'all' ? `Every gate regains ${e.amount} durability` : `Gates in this lane regain ${e.amount} durability`;
    case 'selfFire':
      return `${onUnit ? 'It fires' : 'Fire'} ${e.shots} extra shots`;
    case 'gainEnergy':
      return `Gain ${e.amount} energy`;
    case 'draw':
      return `Draw ${e.count === 1 ? 'a card' : `${e.count} cards`}`;
    case 'loseCrowd':
      return `Feedback: lose ${e.amount} crowd`;
    case 'volume':
      return `Volume: +${e.amount} damage for good`;
    case 'ifChain': {
      const label = `Encore (chain ${e.min}+)`;
      const then = lower(effectsText(e.then)).replace(/\.$/, '');
      if (!e.else || e.else.length === 0) return `${label}: ${then}`;
      const changed = onlyAmountDiffers(e.then, e.else);
      return `${effectsText(e.else).replace(/\.$/, '')}. ${label}: ${changed ?? then} instead`;
    }
    case 'ifDownbeat': {
      const label = 'Downbeat (on beat 1)';
      const then = lower(effectsText(e.then)).replace(/\.$/, '');
      if (!e.else || e.else.length === 0) return `${label}: ${then}`;
      const changed = onlyAmountDiffers(e.then, e.else);
      return `${effectsText(e.else).replace(/\.$/, '')}. ${label}: ${changed ?? then} instead`;
    }
  }
}

function lower(s: string): string {
  // Keep proper names (Roadie, Breaker, Encore…) capitalized: only lower a plain leading verb.
  return /^(Deal|Gain|Draw|Put|Every gate|Every unit|Every Squire|Gates|Units|Fire|It fires|Volume|Slow|Win)\b/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
}
