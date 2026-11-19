/**
 * Accès sécurisé au stockage du navigateur (peut être indisponible en navigation privée).
 * - Jeton MJ : localStorage (persistant).
 * - Jeton joueur : sessionStorage (propre à l'onglet, pratique pour tester plusieurs joueurs)
 *   ET localStorage (pour retrouver sa session après fermeture du navigateur).
 */
function get(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function set(store: 'local' | 'session', key: string, value: string | null) {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

const GM_KEY = 'lg.gm';
const PLAYER_KEY = 'lg.player';

export interface GmSession { token: string; username: string }
export interface PlayerSession { token: string; code: string; name: string }

export const storage = {
  getGm(): GmSession | null {
    const raw = get('local', GM_KEY);
    try { return raw ? (JSON.parse(raw) as GmSession) : null; } catch { return null; }
  },
  setGm(s: GmSession | null) {
    set('local', GM_KEY, s ? JSON.stringify(s) : null);
  },
  getPlayer(): PlayerSession | null {
    const raw = get('session', PLAYER_KEY) ?? get('local', PLAYER_KEY);
    try { return raw ? (JSON.parse(raw) as PlayerSession) : null; } catch { return null; }
  },
  setPlayer(s: PlayerSession | null) {
    const v = s ? JSON.stringify(s) : null;
    set('session', PLAYER_KEY, v);
    set('local', PLAYER_KEY, v);
  },
};
