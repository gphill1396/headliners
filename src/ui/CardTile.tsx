import { HEADLINERS, type CardDef } from '../engine';
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
  /**
   * 'pointerdown' for the hand (instant, for timing). 'click' for menus, so a tap
   * that started before the menu opened can't select anything.
   */
  activateOn?: 'pointerdown' | 'click';
  onSelect?: () => void;
}

/** A card in the hand (compact) or in a card pick (large, with rules text). */
export function CardTile({ def, selected = false, affordable = true, large = false, coach = false, activateOn = 'pointerdown', onSelect }: Props) {
  return (
    <button
      type="button"
      className={`card${selected ? ' selected' : ''}${affordable ? '' : ' poor'}${large ? ' large' : ''}${coach ? ' coach' : ''}`}
      style={{ ['--accent' as string]: cardAccent(def) }}
      onPointerDown={(e) => {
        if (activateOn !== 'pointerdown') return;
        e.preventDefault();
        onSelect?.();
      }}
      onClick={() => {
        if (activateOn === 'click') onSelect?.();
      }}
      aria-pressed={selected}
      aria-label={`${def.name}, costs ${def.cost}. ${def.text}`}
    >
      <span className="card-cost">{def.cost}</span>
      {def.headliner && <span className={`card-sig hl-${def.headliner}`} title={`${HEADLINERS[def.headliner].name} signature card`} />}
      <span className="card-name">{def.name}</span>
      {large ? <span className="card-text">{def.text}</span> : <span className="card-short">{def.short}</span>}
      {large && <span className="card-type">{TYPE_LABEL[def.type]}</span>}
    </button>
  );
}
