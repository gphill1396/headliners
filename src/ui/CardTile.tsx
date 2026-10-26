import type React from 'react';
import { HEADLINERS, type CardDef } from '../engine';
import { cardText } from '../content/text';
import { GATE_COLORS } from '../render/field';
import { PALETTE } from '../render/palette';

export function cardAccent(def: CardDef): string {
  switch (def.type) {
    case 'unit':
      // Oak: units are the band themselves (cream vanished on the vellum card face).
      return '#7a5130';
    case 'gate':
      return GATE_COLORS[def.gate!.kind];
    case 'riff':
      return '#b49ce0';
    case 'amp':
      return PALETTE.miss;
  }
}

/** Crowd a card costs to play (Feedback cards), shown as a small red mark so the loss is never a surprise. */
export function crowdCost(def: CardDef): number {
  return (def.onPlay ?? []).reduce((n, e) => n + (e.do === 'loseCrowd' ? e.amount : 0), 0);
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
  /** Hand only: the raw press, for drag-to-play and long-press. */
  onPress?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

/** A card in the hand (compact) or in a card pick (large, with rules text). */
export function CardTile({ def, selected = false, affordable = true, large = false, coach = false, activateOn = 'pointerdown', onSelect, onPress }: Props) {
  return (
    <button
      type="button"
      className={`card${selected ? ' selected' : ''}${affordable ? '' : ' poor'}${large ? ' large' : ''}${coach ? ' coach' : ''}`}
      style={{ ['--accent' as string]: cardAccent(def) }}
      onPointerDown={(e) => {
        if (activateOn !== 'pointerdown') return;
        e.preventDefault();
        onSelect?.();
        onPress?.(e);
      }}
      onClick={() => {
        if (activateOn === 'click') onSelect?.();
      }}
      aria-pressed={selected}
      aria-label={`${def.name}, costs ${def.cost}. ${cardText(def)}`}
    >
      <span className="card-cost">{def.cost}</span>
      {crowdCost(def) > 0 && (
        <span className="card-crowd" title={`Costs ${crowdCost(def)} crowd`}>
          −{crowdCost(def)}
        </span>
      )}
      {def.headliner && <span className={`card-sig hl-${def.headliner}`} title={`${HEADLINERS[def.headliner].name} signature card`} />}
      <span className="card-name">{def.name}</span>
      {/* In hand, just the name: what it does shows above the hand when you select it. */}
      {large && <span className="card-text">{cardText(def)}</span>}
      {large && <span className="card-type">{TYPE_LABEL[def.type]}</span>}
    </button>
  );
}
