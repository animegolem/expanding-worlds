/** The vertical mode charm rail, upper-right (RFC §8.2).
 * @startingPoint section="Chrome" subtitle="Mode charm rail with perch" viewport="120x300"
 */
export interface CharmRailProps {
  /** Which mode is active: project | search | graph | gallery | outline | menu */
  active?: string;
  /** >0 appends the ⚠ perch charm with a count badge */
  conditionCount?: number;
  /** Absolute top-right placement (app default) vs inline */
  floating?: boolean;
  onSelect?: (id: string) => void;
  style?: React.CSSProperties;
}
