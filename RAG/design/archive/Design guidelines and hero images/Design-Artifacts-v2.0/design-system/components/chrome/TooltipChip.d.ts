/** The one tooltip chip style, app-wide (RFC §8.2). */
export interface TooltipChipProps {
  /** The control's name */
  name: string;
  /** Printed shortcut, mono: 'N', '⌘]' */
  shortcut?: string;
  style?: React.CSSProperties;
}
