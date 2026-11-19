import type { ReactNode } from 'react';

/**
 * La grande table ronde vue du dessus (illustration détourée /assets/table-ronde.webp, 966×927).
 * La table est posée sur le plancher sombre de la salle du conseil ; les joueurs s'assoient
 * sur les 11 chaises peintes, en partant du haut et dans le sens horaire.
 */
const ASPECT = 966 / 927; // largeur / hauteur de l'illustration (et de la scène)
const CX = 50.35; // centre de la table, en % de la scène
const CY = 50.92;
const RX = 36; // rayon de l'anneau des chaises (% largeur)
const RY = 37.5; // rayon de l'anneau des chaises (% hauteur)

/** Centre des 11 assises rouges, en % de l'illustration, sens horaire depuis le haut (mesuré sur l'image). */
const CHAIRS: [number, number][] = [
  [60.79, 15.41], [78.16, 27.38], [87.28, 48.47], [81.51, 70.24], [66.46, 83.99], [50.31, 88.08],
  [34.4, 83.84], [18.53, 70.01], [13.77, 48.33], [21.79, 28.34], [39.63, 15.5],
];

/**
 * Position d'un joueur, en % de la scène (donc identique quelle que soit la taille d'écran).
 * Jusqu'à 11 joueurs : chacun est posé sur une chaise, réparties régulièrement autour de la table.
 * Au-delà : places réparties sur l'anneau des chaises.
 */
export function seatPosition(i: number, n: number) {
  if (n <= CHAIRS.length) {
    const [left, top] = CHAIRS[Math.round((i * CHAIRS.length) / Math.max(n, 1)) % CHAIRS.length];
    return { left, top };
  }
  const a = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
  return { left: CX + RX * Math.cos(a), top: CY + RY * Math.sin(a) };
}

/** Largeur d'un jeton en % de la largeur de la scène, adaptée au nombre de places. */
export function seatSize(n: number) {
  const perimeter = Math.PI * (RX + RY / ASPECT); // périmètre approx. en % de la largeur
  return Math.max(4, Math.min(11, (perimeter / Math.max(n, 1)) * 0.6));
}

export function TableScene({ night, center, children, className = '' }: { night?: boolean; center?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={`table-scene relative w-full select-none overflow-hidden rounded-2xl ring-1 ring-or-500/30 shadow-[0_20px_60px_rgba(0,0,0,.55)] ${className}`}
      style={{
        aspectRatio: String(ASPECT),
        // Plancher de la salle : lattes sombres sous une lumière tamisée.
        background: `radial-gradient(60% 60% at ${CX}% ${CY}%, rgba(120,72,30,.35), transparent 70%), repeating-linear-gradient(90deg, #1d1410 0 9%, #17100c 9% 9.4%), #140e0b`,
      }}
    >
      <img
        src="/assets/table-ronde.webp"
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,.65)] transition duration-1000 ${night ? 'brightness-[.6] saturate-[.85] hue-rotate-[-8deg]' : ''}`}
      />
      {/* Lueur des bougies sur la table */}
      <div className="table-candles pointer-events-none absolute" style={{ left: `${CX - 24}%`, top: `${CY - 25}%`, width: '48%', height: '50%' }} />
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 80px 20px rgba(5,7,20,.6)' }} />
      {center && (
        <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-full bg-nuit-950/55 px-3 py-1.5 text-center backdrop-blur-[2px]" style={{ left: `${CX}%`, top: `${CY}%` }}>
          {center}
        </div>
      )}
      {children}
    </div>
  );
}
