/** Note panel — paper, tethered or pinned (§8.5).
 * @startingPoint section="Panels" subtitle="Paper note panel" viewport="380x300"
 */
export interface NotePanelProps {
  title?: string;
  /** Subject node's tags (zero-node notes show none) */
  tags?: string[];
  /** ⌖ n places header fact */
  places?: number;
  pinned?: boolean;
  /** Origin board label when the node is on another board */
  origin?: string;
  /** Unsaved dot */
  dirty?: boolean;
  width?: number | string;
  height?: number | string;
  children?: React.ReactNode;
  onPin?: () => void;
  onClose?: () => void;
  style?: React.CSSProperties;
}
