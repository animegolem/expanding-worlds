/** Selection charm bar (§4.3). */
export interface CharmBarProps {
  /** Note charm lit (node has a note) */
  noteActive?: boolean;
  /** crop | flipH | flipV | canvas | note | tags | lock */
  onAction?: (id: string) => void;
  style?: React.CSSProperties;
}
