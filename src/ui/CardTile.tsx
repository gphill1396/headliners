import type { CardDef } from '../engine';
import { GATE_COLORS } from '../render/field';
import { PALETTE } from '../render/palette';

export function cardAccent(def: CardDef): string {
  switch (def.type) {
    case 'unit':
      return PALETTE.cream;
    case 'gate':
      return GATE_COLORS[def.gate!.kind];
    case 'riff':
      return '#b49ce0';
    case 'amp':
      return PALETTE.miss;
  }
}

const TYPE_LABEL: Record<CardDef['type'], string> = { unit: 'Unit', gate: 'Gate', riff: 'Riff', amp: 'Amp' };

interface Props {
  def: CardDef;
  selected?: boolean;
  affordable?: boolean;
  large?: boolean;
  /** Highlighted by the soundcheck coach. */
  coach?: boolean;
  onSelect?: () => void;
}

/** A card in the hand (compact) or in a card pick (large, with rules text). */
export function CardTile({ def, selected = false, affordable = true, large = false, coach = false, onSelect }: Props) {
  return (
    <button
      type="button"
      className={`card${selected ? ' selected' : ''}${affordable ? '' : ' poor'}${large ? ' large' : ''}${coach ? ' coach' : ''}`}
      style={{ ['--accent' as string]: cardAccent(def) }}
      onPointerDown={(e) => {
        e.preventDefault();
        onSelect?.();
      }}
      aria-pressed={selected}
      aria-label={`${def.name}, costs ${def.cost}. ${def.text}`}
    >
      <span className="card-cost">{def.cost}</span>
      {def.headliner && <span className="card-sig" title="Thrum signature card" />}
      <span className="card-name">{def.name}</span>
      {large ? <span className="card-text">{def.text}</span> : <span className="card-short">{def.short}</span>}
      {large && <span className="card-type">{TYPE_LABEL[def.type]}</span>}
    </button>
  );
}
