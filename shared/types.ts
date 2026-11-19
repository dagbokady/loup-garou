/**
 * Types partagés entre le serveur et le client.
 * Le serveur reste la seule source de vérité : le client ne reçoit que des « vues »
 * filtrées selon l'identité de la personne connectée (Maître du jeu ou joueur).
 */

export type RoleId =
  | 'villageois'
  | 'voyante'
  | 'sorciere'
  | 'chasseur'
  | 'cupidon'
  | 'petiteFille'
  | 'ancien'
  | 'corbeau'
  | 'salvateur'
  | 'renard'
  | 'loup'
  | 'loupNoir'
  | 'loupBavard'
  | 'angeDechu'
  | 'joueurDeFlute'
  | 'loupBlanc'
  | 'chienLoup'
  | 'filleDeJoie';

export type Camp = 'village' | 'loups' | 'mercenaires' | 'variable';

export type Phase = 'lobby' | 'night' | 'day' | 'ended';
export type GameStatus = 'lobby' | 'running' | 'ended' | 'cancelled';

/** Actions nocturnes que le Maître du jeu peut enregistrer. */
export type NightActionKey =
  | 'filleDeJoie'
  | 'cupidon'
  | 'chienLoup'
  | 'angeDechu'
  | 'voyante'
  | 'renard'
  | 'salvateur'
  | 'loups'
  | 'loupNoir'
  | 'loupBlanc'
  | 'sorciere'
  | 'corbeau'
  | 'loupBavard'
  | 'joueurDeFlute';

export interface NightActionRecord {
  key: NightActionKey;
  targets: string[];
  /** chienLoup : 'village' | 'loups' ; angeDechu : 'survie' | 'elimination' ; loupNoir : 'transformer' | 'non' ; loupBavard : 'annuler' | 'rediriger' | 'passer' (cibles : [votant, destination?]) */
  choice?: string;
  /** sorcière */
  heal?: string | null;
  poison?: string | null;
  note?: string;
  recordedAt: number;
}

export type ConsequenceKind = 'death' | 'transform' | 'ancienShield' | 'whisper' | 'info' | 'renardLost';

export interface Consequence {
  id: string;
  kind: ConsequenceKind;
  playerId?: string;
  /** Texte affiché au Maître du jeu */
  label: string;
  /** Message privé envoyé au joueur (kind === 'whisper') */
  whisper?: string;
  checked: boolean;
  /** Une conséquence purement informative ne peut pas être cochée */
  informative?: boolean;
}

export interface NightState {
  number: number;
  awake: NightActionKey | null;
  actions: Partial<Record<NightActionKey, NightActionRecord>>;
  validated: boolean;
  /** Morts validées durant cette nuit (annoncées au lever du jour) */
  deaths: string[];
  /** Un joueur a été transformé par le Loup Noir (annonce anonyme au lever du jour) */
  transformed?: boolean;
  /** Le Chef du village est mort cette nuit (annoncé au lever du jour, il désigne alors son successeur) */
  chiefDied?: string;
  /** Fin du chrono de la meute (1 minute après son réveil) */
  wolfDeadline?: number;
  /** Suggestions de la meute : loup → cible proposée */
  wolfSuggestions?: Record<string, string>;
}

export type VoteKind = 'elimination' | 'chef' | 'autre';
export type VoteStatus = 'open' | 'closed';

export interface BavardEffect {
  byPlayerId: string;
  targetVoterId: string;
  effect: 'annuler' | 'rediriger';
  redirectTo?: string;
}

export interface TallyEntry {
  playerId: string;
  total: number;
  details: { from: string; weight: number; note?: string }[];
}

export interface VoteResult {
  entries: TallyEntry[];
  abstentions: string[];
  leaders: string[];
  notes: string[];
}

export interface VoteRecord {
  id: string;
  kind: VoteKind;
  label: string;
  status: VoteStatus;
  day: number;
  candidates: string[];
  voters: string[];
  ballots: Record<string, string>;
  bavard: BavardEffect | null;
  ravenTargetId: string | null;
  chiefIdAtOpen: string | null;
  openedAt: number;
  closesAt?: number;
  closedAt?: number;
  result?: VoteResult;
  /** Résultat affiché aux joueurs (totaux uniquement) */
  published: boolean;
  /** Issue appliquée (élimination / Chef nommé) — automatique si un seul gagnant, sinon tranchée par le MJ */
  appliedTo?: string;
}

export type EventVisibility = 'public' | 'gm';

export interface GameEvent {
  id: string;
  at: number;
  phase: Phase;
  round: number;
  visibility: EventVisibility;
  type:
    | 'system'
    | 'phase'
    | 'death'
    | 'revive'
    | 'action'
    | 'vote'
    | 'chief'
    | 'whisper'
    | 'role'
    | 'end'
    | 'announce';
  text: string;
}

export interface ChatMessage {
  id: string;
  at: number;
  fromId: string;
  fromName: string;
  text: string;
  night: number;
}

export interface Whisper {
  id: string;
  at: number;
  text: string;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  connected: boolean;
  roleId: RoleId | null;
  /** Rôle initial (utile si le Loup Noir a transformé le joueur) */
  originalRoleId: RoleId | null;
  /** Rôle révélé publiquement à la mort */
  revealed: boolean;
  charmed: boolean;
  deathReason?: string;
  deathRound?: string;
  whispers: Whisper[];
  joinedAt: number;
}

export interface PowerState {
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  ancienAttacks: number;
  salvateurLastTarget: string | null;
  salvateurLastNight: number | null;
  /** Chez qui la Fille de joie a dormi la dernière fois (interdit la nuit suivante) */
  filleDeJoieLastHost?: string | null;
  filleDeJoieLastNight?: number | null;
  renardLost: boolean;
  chienLoupCamp: 'village' | 'loups' | null;
  angeChoice: 'survie' | 'elimination' | null;
  loupNoirUsed: boolean;
  loupBavardUsed: boolean;
  /** Effet du Loup Bavard choisi la nuit, appliqué au prochain vote du village */
  bavardPending?: BavardEffect | null;
  ravenTarget: string | null;
  lovers: [string, string] | null;
  /** L'Ange Déchu a été éliminé lors du premier vote du village */
  angeWon?: boolean;
  /** Visions de la Voyante, révélées immédiatement sur son téléphone */
  seerVisions?: { night: number; targetId: string; roleId: RoleId | null }[];
}

export type PendingTrigger =
  | { id: string; type: 'hunter'; playerId: string }
  | { id: string; type: 'lover'; playerId: string; partnerId: string }
  | { id: string; type: 'chief'; playerId: string };

/** Vérification d'une condition de victoire (aide au MJ, jamais appliquée automatiquement). */
export interface VictoryCheck {
  id: WinnerCamp;
  label: string;
  met: boolean;
  detail: string;
}

export type WinnerCamp = 'village' | 'loups' | 'loupBlanc' | 'flute' | 'ange' | 'amoureux';

export interface GameSettings {
  expectedPlayers: number;
  piperCharmCount: number;
}

/** Vue complète réservée au Maître du jeu (jamais envoyée à un joueur). */
/** Composition de rôles enregistrée par un MJ. */
export interface CompositionPreset { id: string; name: string; composition: Partial<Record<RoleId, number>>; updatedAt: number }

/** Minuteur de débat lancé par le MJ pendant le jour. */
export interface DebateTimer { endsAt: number; seconds: number }

export interface GmGameView {
  debate?: DebateTimer | null;
  id: string;
  code: string;
  createdAt: number;
  status: GameStatus;
  phase: Phase;
  dayNumber: number;
  nightNumber: number;
  settings: GameSettings;
  composition: Partial<Record<RoleId, number>>;
  players: PlayerState[];
  chiefId: string | null;
  powers: PowerState;
  night: NightState | null;
  proposedConsequences: Consequence[];
  vote: VoteRecord | null;
  votes: VoteRecord[];
  events: GameEvent[];
  wolfChat: ChatMessage[];
  pendingTriggers: PendingTrigger[];
  winner: string | null;
  winnerIds: string[];
  rolesDistributed: boolean;
  /** Période de révélation : chacun découvre sa carte, avant la première nuit (close par le MJ) */
  revealing: boolean;
  /** Joueurs ayant retourné leur carte pendant la révélation */
  sawCard: string[];
  /** Pour la vue du vote en cours : nombre de bulletins, sans leur contenu */
  voteProgress: { voted: string[]; total: number } | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  connected: boolean;
  isChief: boolean;
  isWinner: boolean;
  /** Rôle visible uniquement s'il a été révélé (mort) ou en fin de partie */
  revealedRoleId: RoleId | null;
}

/** Vue d'un joueur : uniquement ses propres secrets. */
export interface PlayerView {
  game: {
    code: string;
    /** Horodatage de création : distingue une revanche (même code) de la partie précédente */
    startedAt: number;
    status: GameStatus;
    phase: Phase;
    dayNumber: number;
    nightNumber: number;
    gmName: string;
    /** Fin du minuteur de débat (jour) */
    debate?: DebateTimer | null;
    winner: string | null;
    /** Période de révélation en cours : chacun peut retourner sa carte */
    revealing: boolean;
  };
  action: {
    key: string;
    kind: 'target' | 'targets' | 'choice' | 'witch' | 'pack' | 'bavard';
    /** Meute : fin du chrono, suggestions visibles de tous les loups, cible retenue */
    endsAt?: number;
    suggestions?: { targetId: string; by: string[] }[];
    mine?: string | null;
    chosen?: string | null;
    max?: number;
    options?: { value: string; label: string }[];
    candidates: { id: string; name: string }[];
    victims?: { id: string; name: string }[];
    note?: string;
    recorded: boolean;
  } | null;
  me: {
    id: string;
    name: string;
    alive: boolean;
    roleId: RoleId | null;
    originalRoleId: RoleId | null;
    isChief: boolean;
    isWinner: boolean;
    /** Enchanté par le Joueur de Flûte, et les autres enchantés vivants qu'il reconnaît */
    charmed: boolean;
    charmedPeers: string[];
    /** Camp effectif (ex. Chien-Loup après son choix) */
    camp: Camp | null;
    campNote: string | null;
    whispers: Whisper[];
    /** Amoureux uni par Cupidon (nom du partenaire) */
    lover: { id: string; name: string; alive: boolean } | null;
    /** Visions de la Voyante (uniquement pour elle) */
    visions: { night: number; targetId: string; name: string; roleId: RoleId | null }[];
  };
  players: PublicPlayer[];
  publicEvents: GameEvent[];
  vote: {
    id: string;
    kind: VoteKind;
    label: string;
    status: VoteStatus;
    closesAt?: number;
    canVote: boolean;
    candidates: { id: string; name: string }[];
    myBallot: string | null;
    published: VoteResult | null;
  } | null;
  /** Loup Bavard (uniquement pour lui) : pouvoir utilisé, et effet en attente du prochain vote */
  bavard: {
    used: boolean;
    pending: { effect: 'annuler' | 'rediriger'; voterName: string; redirectName?: string } | null;
  } | null;
  /** Morts de la nuit passée, affichées au lever du jour. */
  /** Joueur éliminé qui suit la partie en spectateur (sans voir les rôles cachés). */
  spectator?: boolean;
  dawn: { day: number; deaths: { id: string; name: string; roleId: RoleId | null; wasChief?: boolean; loverOf?: string }[] } | null;
  /** Le village attend que l'ancien Chef désigne son successeur (son nom). */
  successionWaiting: string | null;
  /** Joueur désigné par le dernier vote du jour. */
  verdict: { id: string; name: string; roleId: RoleId | null; lover?: { name: string; roleId: RoleId | null } } | null;
  /** Chasseur mort : il désigne lui-même qui il emporte (validé dès son choix). */
  hunter: { triggerId: string; candidates: { id: string; name: string }[] } | null;
  /** Ancien Chef (mort ou éliminé) : il désigne lui-même son successeur. */
  succession: { triggerId: string; candidates: { id: string; name: string }[] } | null;
  wolfChat: {
    open: boolean;
    pack: string[];
    messages: ChatMessage[];
  } | null;
}

export interface ArchivedGame {
  id: string;
  code: string;
  gmName: string;
  createdAt: number;
  endedAt: number;
  status: 'ended' | 'cancelled';
  winner: string | null;
  composition: Partial<Record<RoleId, number>>;
  settings: GameSettings;
  players: {
    id?: string;
    name: string;
    seat: number;
    roleId: RoleId | null;
    originalRoleId: RoleId | null;
    alive: boolean;
    winner?: boolean;
    deathReason?: string;
    deathRound?: string;
  }[];
  events: GameEvent[];
  votes: VoteRecord[];
  imported?: boolean;
}

export interface ArchiveSummary {
  id: string;
  code: string;
  createdAt: number;
  endedAt: number;
  status: 'ended' | 'cancelled';
  winner: string | null;
  playerCount: number;
  imported?: boolean;
}

/** Réponse standard des acquittements Socket.IO. */
export type Ack<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
