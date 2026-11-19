/**
 * Le Grimoire : fiches de tous les rôles disponibles.
 * Les pouvoirs décrits ici sont ceux du cahier des charges — aucun pouvoir n'est inventé.
 */
import type { Camp, NightActionKey, RoleId } from './types';

export interface RoleSheet {
  id: RoleId;
  name: string;
  camp: Camp;
  image: string | null;
  /** Courte phrase d'ambiance */
  tagline: string;
  description: string;
  powers: string[];
  victory: string;
  rules: string[];
  /** Peut-il y avoir plusieurs exemplaires de ce rôle dans une partie ? */
  multiple: boolean;
}

export const CAMP_LABELS: Record<Camp, string> = {
  village: 'Camp des Villageois',
  loups: 'Camp des Loups-Garous',
  mercenaires: 'Camp des Mercenaires',
  variable: 'Camp variable',
};

export const CAMP_SHORT: Record<Camp, string> = {
  village: 'Villageois',
  loups: 'Loups-Garous',
  mercenaires: 'Mercenaires',
  variable: 'Variable',
};

const VILLAGE_WIN =
  'Le village gagne lorsque toutes les menaces ont été éliminées : tous les Loups-Garous ainsi que les Mercenaires qui le menacent.';
const WOLF_WIN = 'Les Loups-Garous gagnent lorsqu’ils ont éliminé tous les autres habitants du village.';

export const ROLES: Record<RoleId, RoleSheet> = {
  villageois: {
    id: 'villageois',
    name: 'Simple Villageois',
    camp: 'village',
    image: null,
    tagline: 'Un cœur honnête, une voix pour le village.',
    description:
      'Habitant ordinaire du village, il ne possède aucun pouvoir particulier. Sa seule arme est son sens de l’observation, son éloquence et son vote.',
    powers: ['Aucun pouvoir spécial.', 'Participe aux débats et aux votes du village.'],
    victory: VILLAGE_WIN,
    rules: ['Il dort toute la nuit et ne se réveille jamais.'],
    multiple: true,
  },
  voyante: {
    id: 'voyante',
    name: 'Voyante',
    camp: 'village',
    image: '/assets/roles/voyante.webp',
    tagline: 'Sa boule de cristal perce les secrets.',
    description:
      'Chaque nuit, la Voyante se réveille et sonde l’âme d’un habitant pour en découvrir la véritable nature.',
    powers: ['Chaque nuit, elle découvre le rôle exact d’un joueur vivant.'],
    victory: VILLAGE_WIN,
    rules: ['Elle agit à partir de la deuxième nuit.', 'Elle ne peut sonder qu’un seul joueur vivant par nuit.', 'Elle seule reçoit l’information.'],
    multiple: false,
  },
  sorciere: {
    id: 'sorciere',
    name: 'Sorcière',
    camp: 'village',
    image: '/assets/roles/sorciere.webp',
    tagline: 'Une fiole pour la vie, une fiole pour la mort.',
    description:
      'La Sorcière connaît deux potions puissantes. Chaque nuit, après l’attaque des Loups-Garous, elle peut décider d’en faire usage.',
    powers: [
      'Potion de guérison : sauve une victime qui devait réellement mourir cette nuit (Loups-Garous ou Loup Blanc), quel que soit son camp, y compris elle-même.',
      'Potion d’empoisonnement : désigne un joueur vivant supplémentaire qui mourra.',
    ],
    victory: VILLAGE_WIN,
    rules: [
      'Elle se réveille après les Loups-Garous ; le MJ lui présente les victimes de la nuit.',
      'Chaque potion ne peut être utilisée qu’une seule fois ; les deux peuvent l’être la même nuit.',
      'Si la victime était déjà protégée par le Salvateur, la potion de guérison n’est pas consommée.',
    ],
    multiple: false,
  },
  chasseur: {
    id: 'chasseur',
    name: 'Chasseur',
    camp: 'village',
    image: '/assets/roles/chasseur.webp',
    tagline: 'Même en tombant, il ne manque jamais sa cible.',
    description: 'Tireur hors pair, le Chasseur emporte toujours quelqu’un avec lui dans la tombe.',
    powers: ['Lorsqu’il est éliminé, il désigne un joueur qui meurt avec lui.'],
    victory: VILLAGE_WIN,
    rules: ['Son tir se déclenche quelle que soit la cause de sa mort. Tué la nuit, il tire au lever du jour, après l’annonce des morts.'],
    multiple: false,
  },
  cupidon: {
    id: 'cupidon',
    name: 'Cupidon',
    camp: 'village',
    image: '/assets/roles/cupidon.webp',
    tagline: 'Ses flèches lient deux destins à jamais.',
    description: 'Durant la première nuit, Cupidon décoche ses flèches et unit deux habitants par un amour éternel.',
    powers: ['Durant la première nuit, il désigne deux amoureux. Il peut se désigner lui-même.'],
    victory: VILLAGE_WIN,
    rules: [
      'Les deux amoureux sont informés de leur lien.',
      'Si l’un des amoureux meurt, quelle qu’en soit la cause, l’autre meurt également de chagrin.',
      'Le lien reste actif même si Cupidon est éliminé.',
    ],
    multiple: false,
  },
  petiteFille: {
    id: 'petiteFille',
    name: 'Petite Fille',
    camp: 'village',
    image: '/assets/roles/petiteFille.webp',
    tagline: 'Des yeux curieux entre ses doigts.',
    description: 'Discrète et curieuse, la Petite Fille entrouvre les yeux pendant que les Loups-Garous choisissent leur proie.',
    powers: ['Peut espionner discrètement les Loups-Garous pendant leur réveil.'],
    victory: VILLAGE_WIN,
    rules: ['Elle n’a pas accès au chat privé des Loups-Garous : l’espionnage se fait autour de la table.'],
    multiple: false,
  },
  ancien: {
    id: 'ancien',
    name: 'Ancien',
    camp: 'village',
    image: '/assets/roles/ancien.webp',
    tagline: 'Les années l’ont rendu coriace.',
    description: 'Doyen du village, l’Ancien a traversé bien des hivers et résiste mieux que quiconque aux crocs des loups.',
    powers: ['Survit à la première attaque réussie des Loups-Garous.'],
    victory: VILLAGE_WIN,
    rules: [
      'Il meurt lors de la deuxième attaque réussie des Loups-Garous.',
      'Cette résistance ne joue pas contre le vote du village ni les autres causes d’élimination.',
    ],
    multiple: false,
  },
  corbeau: {
    id: 'corbeau',
    name: 'Corbeau',
    camp: 'village',
    image: '/assets/roles/corbeau.webp',
    tagline: 'Sa plume noire marque les suspects.',
    description: 'Messager des ombres, le Corbeau désigne chaque nuit un habitant qui portera le poids du soupçon.',
    powers: ['Chaque nuit, il désigne un joueur qui reçoit deux voix supplémentaires au prochain vote.'],
    victory: VILLAGE_WIN,
    rules: ['Les deux voix s’appliquent au prochain vote du village.', 'Utilisable chaque nuit tant qu’il est vivant.'],
    multiple: false,
  },
  salvateur: {
    id: 'salvateur',
    name: 'Salvateur',
    camp: 'village',
    image: '/assets/roles/salvateur.webp',
    tagline: 'Son bouclier veille sur le village.',
    description: 'Chevalier protecteur, le Salvateur étend chaque nuit son bouclier sur un habitant.',
    powers: ['Chaque nuit, il protège un joueur vivant contre les attaques des Loups-Garous et du Loup Blanc.'],
    victory: VILLAGE_WIN,
    rules: [
      'Il peut se protéger lui-même.',
      'Il ne peut pas protéger la même personne deux nuits consécutives.',
      'Sa protection ne bloque pas la transformation du Loup Noir.',
    ],
    multiple: false,
  },
  renard: {
    id: 'renard',
    name: 'Renard',
    camp: 'village',
    image: '/assets/roles/renard.webp',
    tagline: 'Son flair ne le trompe… presque jamais.',
    description: 'Rusé, le Renard flaire un groupe de trois habitants pour savoir si un loup s’y cache.',
    powers: ['Vérifie un joueur et ses deux voisins dans l’ordre des joueurs : il apprend si au moins un loup s’y trouve.'],
    victory: VILLAGE_WIN,
    rules: ['Si aucun des trois n’est un loup, il perd définitivement son pouvoir.'],
    multiple: false,
  },
  loup: {
    id: 'loup',
    name: 'Simple Loup',
    camp: 'loups',
    image: '/assets/roles/loup.webp',
    tagline: 'La meute chasse sous la lune.',
    description: 'Chaque nuit, les Loups-Garous se réveillent ensemble et choisissent une victime à dévorer.',
    powers: ['Participe aux décisions collectives des Loups-Garous.'],
    victory: WOLF_WIN,
    rules: ['Le jour, il se fait passer pour un villageois.', 'Il a accès au chat privé de la meute pendant la nuit.'],
    multiple: true,
  },
  loupNoir: {
    id: 'loupNoir',
    name: 'Loup Noir',
    camp: 'loups',
    image: '/assets/roles/loupNoir.webp',
    tagline: 'Sa morsure ne tue pas : elle transforme.',
    description: 'Chef de meute redouté, le Loup Noir peut corrompre une âme au lieu de la dévorer.',
    powers: [
      'Participe aux attaques collectives des Loups-Garous.',
      'Une seule fois, il peut transformer en Simple Loup la victime choisie par les Loups-Garous, au lieu de la tuer.',
    ],
    victory: WOLF_WIN,
    rules: [
      'Le pouvoir n’est utilisable qu’une fois, et seulement sur la victime choisie par la meute.',
      'La victime rejoint la meute ; le village apprend qu’une personne a rejoint les Loups-Garous, sans connaître son ancien rôle.',
    ],
    multiple: false,
  },
  loupBavard: {
    id: 'loupBavard',
    name: 'Loup Bavard',
    camp: 'loups',
    image: '/assets/roles/loupBavard.webp',
    tagline: 'Un mot glissé à l’oreille, et le vote bascule.',
    description: 'Manipulateur hors pair, le Loup Bavard sait détourner la voix d’un habitant.',
    powers: [
      'Participe aux attaques collectives des Loups-Garous.',
      'Une seule fois dans la partie, la nuit, il choisit un joueur dont le vote sera annulé ou redirigé lors du prochain vote du village.',
    ],
    victory: WOLF_WIN,
    rules: [
      'Il est appelé chaque nuit (à partir de la nuit 2), même après avoir utilisé son pouvoir, pour ne pas se trahir.',
      'Il peut viser n’importe quel joueur vivant : villageois, loup ou mercenaire.',
      'S’il redirige, il choisit aussi vers qui le vote ira. Si cette personne ne peut plus être désignée, le vote est simplement annulé.',
    ],
    multiple: false,
  },
  angeDechu: {
    id: 'angeDechu',
    name: 'Ange Déchu',
    camp: 'mercenaires',
    image: '/assets/roles/angeDechu.webp',
    tagline: 'Tombé du ciel, il choisit son destin.',
    description: 'Créature céleste déchue, l’Ange choisit au début de la partie la voie qui le mènera à la victoire.',
    powers: ['Au début de la partie, il choisit entre survivre jusqu’à la fin ou être éliminé lors du premier vote du village.'],
    victory:
      'Selon son choix : être encore en vie à la fin de la partie, ou être éliminé lors du premier vote du village.',
    rules: ['Son choix est définitif.'],
    multiple: false,
  },
  joueurDeFlute: {
    id: 'joueurDeFlute',
    name: 'Joueur de Flûte',
    camp: 'mercenaires',
    image: '/assets/roles/joueurDeFlute.webp',
    tagline: 'Sa mélodie ensorcelle le village.',
    description: 'Musicien mystérieux, le Joueur de Flûte enchante chaque nuit de nouveaux habitants.',
    powers: ['Chaque nuit, il enchante le nombre de joueurs défini par le Maître du jeu.'],
    victory: 'Il gagne lorsque tous les autres joueurs vivants sont enchantés.',
    rules: [
      'Le nombre de joueurs enchantés par nuit est fixé par le Maître du jeu ; il ne peut pas s’enchanter lui-même.',
      'Les enchantés sont informés et reconnaissent les autres enchantés. L’enchantement dure toute la partie.',
    ],
    multiple: false,
  },
  loupBlanc: {
    id: 'loupBlanc',
    name: 'Loup Blanc',
    camp: 'mercenaires',
    image: '/assets/roles/loupBlanc.webp',
    tagline: 'Il chasse avec la meute… et chasse la meute.',
    description: 'Loup solitaire au pelage d’argent, il participe aux attaques des loups mais ne rêve que de rester seul.',
    powers: [
      'Participe aux attaques collectives des Loups-Garous.',
      'Une nuit sur deux à partir de la troisième nuit (nuits 3, 5, 7…), il peut éliminer personnellement un joueur vivant, y compris un loup.',
    ],
    victory: 'Il gagne s’il devient le dernier survivant.',
    rules: ['Il a accès au chat privé des Loups-Garous.'],
    multiple: false,
  },
  filleDeJoie: {
    id: 'filleDeJoie',
    name: 'Fille de joie',
    camp: 'village',
    image: '/assets/roles/filleDeJoie.webp',
    tagline: 'Un battement d’éventail, et les pouvoirs s’endorment.',
    description:
      'Villageoise charmeuse, la Fille de joie se glisse chaque nuit chez un habitant pour le séduire. Son hôte, troublé, croit agir normalement… mais son pouvoir reste sans effet.',
    powers: [
      'Chaque nuit, elle choisit un joueur chez qui dormir (villageois, loup ou autre). Les pouvoirs de cette nuit de son hôte sont neutralisés, sans qu’il le sache : il est appelé et choisit, mais son action ne compte pas.',
    ],
    victory: VILLAGE_WIN,
    rules: [
      'Elle ne peut pas dormir chez la même personne deux nuits de suite.',
      'Si les loups l’attaquent alors qu’elle dort ailleurs, elle survit : elle n’est pas chez elle.',
      'Si les loups attaquent la personne chez qui elle dort, l’hôte et elle meurent tous les deux.',
      'Elle se réveille en premier, avant tous les autres rôles.',
    ],
    multiple: false,
  },
  chienLoup: {
    id: 'chienLoup',
    name: 'Chien-Loup',
    camp: 'variable',
    image: '/assets/roles/chienLoup.webp',
    tagline: 'Fidèle compagnon… ou bête sauvage ?',
    description: 'Mi-chien, mi-loup, il doit choisir lors de la première nuit à quel camp il prête allégeance.',
    powers: ['Lors de la première nuit, il choisit son camp : Villageois ou Loups-Garous.'],
    victory: 'Il gagne avec le camp qu’il a choisi.',
    rules: [
      'Son choix est définitif.',
      'S’il rejoint les Loups-Garous, il découvre leur identité, ils le reconnaissent, et il participe à leurs attaques.',
    ],
    multiple: false,
  },
};

export const ROLE_ORDER: RoleId[] = [
  'villageois',
  'voyante',
  'sorciere',
  'chasseur',
  'cupidon',
  'petiteFille',
  'ancien',
  'corbeau',
  'salvateur',
  'renard',
  'filleDeJoie',
  'loup',
  'loupNoir',
  'loupBavard',
  'angeDechu',
  'joueurDeFlute',
  'loupBlanc',
  'chienLoup',
];

/** Rôles qui appartiennent à la meute (attaques collectives + chat). */
export const PACK_ROLES: RoleId[] = ['loup', 'loupNoir', 'loupBavard', 'loupBlanc'];

/** Informations sur les actions nocturnes : ordre suggéré et rôle concerné. */
export interface NightActionInfo {
  key: NightActionKey;
  title: string;
  role: RoleId | 'pack';
  firstNightOnly?: boolean;
  hint: string;
}

export const NIGHT_ACTIONS: NightActionInfo[] = [
  { key: 'cupidon', title: 'Cupidon', role: 'cupidon', firstNightOnly: true, hint: 'Désigne deux amoureux.' },
  { key: 'chienLoup', title: 'Chien-Loup', role: 'chienLoup', firstNightOnly: true, hint: 'Choisit son camp, définitivement.' },
  { key: 'angeDechu', title: 'Ange Déchu', role: 'angeDechu', firstNightOnly: true, hint: 'Choisit sa voie : survie ou élimination au premier vote.' },
  { key: 'filleDeJoie', title: 'Fille de joie', role: 'filleDeJoie', hint: 'Choisit chez qui dormir : le pouvoir de son hôte est neutralisé (jamais deux nuits de suite chez le même).' },
  { key: 'voyante', title: 'Voyante', role: 'voyante', hint: 'Découvre le rôle exact d’un joueur vivant.' },
  { key: 'renard', title: 'Renard', role: 'renard', hint: 'Flaire un joueur et ses deux voisins.' },
  { key: 'salvateur', title: 'Salvateur', role: 'salvateur', hint: 'Protège un joueur (pas deux nuits de suite le même).' },
  { key: 'loups', title: 'Les Loups-Garous', role: 'pack', hint: 'La meute choisit sa victime. La Petite Fille peut espionner.' },
  { key: 'loupNoir', title: 'Loup Noir', role: 'loupNoir', hint: 'Peut transformer la victime en Simple Loup (une fois).' },
  { key: 'loupBlanc', title: 'Loup Blanc', role: 'loupBlanc', hint: 'Nuits 3, 5, 7… : peut éliminer un joueur.' },
  { key: 'sorciere', title: 'Sorcière', role: 'sorciere', hint: 'Après les loups : guérison et/ou poison.' },
  { key: 'corbeau', title: 'Corbeau', role: 'corbeau', hint: 'Désigne un joueur : +2 voix au prochain vote.' },
  { key: 'loupBavard', title: 'Loup Bavard', role: 'loupBavard', hint: 'Appelé chaque nuit. Une fois par partie : annule ou redirige le vote d’un joueur au prochain vote du village.' },
  { key: 'joueurDeFlute', title: 'Joueur de Flûte', role: 'joueurDeFlute', hint: 'Enchante des joueurs.' },
];

/**
 * Proposition automatique de composition selon le nombre de joueurs.
 * Le Maître du jeu peut ensuite la modifier librement.
 */
export function suggestComposition(n: number): Partial<Record<RoleId, number>> {
  const comp: Partial<Record<RoleId, number>> = {};
  if (n < 1) return comp;
  const add = (r: RoleId, k = 1) => (comp[r] = (comp[r] ?? 0) + k);

  // Meute : environ un loup pour quatre joueurs.
  let wolves = Math.max(1, Math.floor(n / 4));
  if (n >= 12) { add('loupNoir'); wolves--; }
  if (n >= 16) { add('loupBavard'); wolves--; }
  add('loup', Math.max(0, wolves));

  // Rôles spéciaux ajoutés progressivement.
  const ladder: [number, RoleId][] = [
    [3, 'voyante'],
    [6, 'sorciere'],
    [7, 'chasseur'],
    [8, 'cupidon'],
    [9, 'salvateur'],
    [10, 'petiteFille'],
    [11, 'ancien'],
    [12, 'filleDeJoie'],
    [13, 'corbeau'],
    [14, 'renard'],
    [15, 'joueurDeFlute'],
    [17, 'chienLoup'],
    [18, 'loupBlanc'],
    [20, 'angeDechu'],
  ];
  for (const [min, role] of ladder) if (n >= min) add(role);

  const used = Object.values(comp).reduce((a, b) => a + (b ?? 0), 0);
  if (n - used > 0) add('villageois', n - used);
  return comp;
}

export function compositionTotal(comp: Partial<Record<RoleId, number>>): number {
  return Object.values(comp).reduce((a, b) => a + (b ?? 0), 0);
}

export function campCounts(comp: Partial<Record<RoleId, number>>): Record<Camp, number> {
  const res: Record<Camp, number> = { village: 0, loups: 0, mercenaires: 0, variable: 0 };
  for (const [id, k] of Object.entries(comp)) res[ROLES[id as RoleId].camp] += k ?? 0;
  return res;
}
