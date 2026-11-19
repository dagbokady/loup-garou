import { CAMP_SHORT } from '@shared/roles';
import type { Camp } from '@shared/types';

export const CAMP_STYLE: Record<Camp, string> = {
  village: 'border-foret-400/70 bg-foret-800/70 text-foret-400',
  loups: 'border-sang-500/70 bg-sang-700/60 text-red-300',
  mercenaires: 'border-mystic-400/70 bg-mystic-800/70 text-mystic-400',
  variable: 'border-or-400/70 bg-or-700/50 text-or-200',
};

export function CampBadge({ camp }: { camp: Camp }) {
  return <span className={`chip ${CAMP_STYLE[camp]}`}>{CAMP_SHORT[camp]}</span>;
}
