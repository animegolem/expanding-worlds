/** A placed node on the board (§4). */
export interface NodeCardProps {
  /** Title rendered below the image, centered, muted */
  title?: string;
  /** Real image; omit for the wireframe stripe placeholder */
  src?: string;
  /** Stripe placeholder recipe: 'angle,dark,darker' */
  stripes?: string;
  width?: number;
  height?: number;
  /** Mono label centered on a stripe placeholder */
  label?: string;
  hasNote?: boolean;
  hasCanvas?: boolean;
  /** Thin accent outline — never drawn handles */
  selected?: boolean;
  /** Lens/tag hit outline (orange) */
  hit?: boolean;
  /** Lens dimming (~.18) for non-hits */
  dimmed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
