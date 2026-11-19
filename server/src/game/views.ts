/**
 * Construction des vues envoyées aux clients.
 * C'est ici que la confidentialité est garantie : chaque joueur ne reçoit
 * que ses propres secrets ; seul le Maître du jeu reçoit la vue complète.
 */
import { ROLES } from '../../../shared/roles.ts';
import type { Camp, GmGameView, PlayerView } from '../../../shared/types.ts';
import { availableNightActions, canPlayerAct, isPackMember, nightVictims, proposeConsequences, victoryChecks, winnersFor, type Game } from './engine.ts';
import { NIGHT_ACTIONS } from '../../../shared/roles.ts';
import type { VictoryCheck, WinnerCamp } from '../../../shared/types.ts';

export interface GmViewExtra extends GmGameView {
  availableActions: ReturnType<typeof availableNightActions>;
  victoryChecks: VictoryCheck[];
  /** Victimes qui doivent mourir cette nuit (pour la Sorcière) */
  nightVictims: string[];
  /** Gagnants proposés par camp, pour la fin de partie */
  winnersByCamp: Record<WinnerCamp, string[]>;
}

export function gmView(game: Game): GmViewExtra {
  const { players, vote, ...rest } = game;
  // Le vote reste secret jusqu'à sa clôture, y compris pour le Maître du jeu :
  // il voit seulement qui a déjà voté.
  const safeVote = vote && vote.status === 'open' ? { ...vote, ballots: {}, bavard: null } : vote;
  return {
    id: rest.id,
    code: rest.code,
    createdAt: rest.createdAt,
    status: rest.status,
    phase: rest.phase,
    dayNumber: rest.dayNumber,
    nightNumber: rest.nightNumber,
    settings: rest.settings,
    composition: rest.composition,
    chiefId: rest.chiefId,
    powers: rest.powers,
    night: rest.night,
    votes: rest.votes,
    events: rest.events,
    wolfChat: rest.wolfChat,
    pendingTriggers: rest.pendingTriggers,
    winner: rest.winner,
    winnerIds: rest.winnerIds,
    rolesDistributed: rest.rolesDistributed,
    debate: rest.debate ?? null,
    revealing: !!rest.revealing,
    sawCard: rest.sawCard ?? [],
    players: players.map(({ token: _token, ...p }) => p),
    vote: safeVote,
    voteProgress: vote && vote.status === 'open' ? { voted: Object.keys(vote.ballots), total: vote.voters.length } : null,
    proposedConsequences: game.phase === 'night' && game.night && !game.night.validated ? proposeConsequences(game) : [],
    availableActions: game.phase === 'night' ? availableNightActions(game) : [],
    victoryChecks: victoryChecks(game),
    nightVictims: game.phase === 'night' && game.night && !game.night.validated ? nightVictims(game) : [],
    winnersByCamp: Object.fromEntries(
      (['village', 'loups', 'loupBlanc', 'flute', 'ange', 'amoureux'] as WinnerCamp[]).map((c) => [c, winnersFor(game, [c])]),
    ) as Record<WinnerCamp, string[]>,
  };
}

export function playerView(game: Game, playerId: string): PlayerView | null {
  const me = game.players.find((p) => p.id === playerId);
  if (!me) return null;
  const ended = game.status === 'ended';
  const showRoles = game.status !== 'lobby' && game.status !== 'cancelled';
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? '—';
  // Les morts de la nuit restent secrètes (même pour la victime) jusqu'au lever du jour.
  const hidden = new Set(game.status === 'running' && game.phase === 'night' && game.night ? game.night.deaths : []);
  const isAlive = (p: { id: string; alive: boolean }) => p.alive || hidden.has(p.id);

  let camp: Camp | null = me.roleId ? ROLES[me.roleId].camp : null;
  let campNote: string | null = null;
  if (me.roleId === 'chienLoup') {
    if (game.powers.chienLoupCamp === 'loups') { camp = 'loups'; campNote = 'Vous avez rejoint la meute des Loups-Garous.'; }
    else if (game.powers.chienLoupCamp === 'village') { camp = 'village'; campNote = 'Vous avez choisi de rester fidèle au village.'; }
    else campNote = 'Vous choisirez votre camp lors de la première nuit.';
  }
  if (me.roleId === 'angeDechu' && game.powers.angeChoice)
    campNote = game.powers.angeChoice === 'survie' ? 'Votre voie : survivre jusqu’à la fin de la partie.' : 'Votre voie : être éliminé lors du premier vote du village.';
  if (me.originalRoleId && me.roleId !== me.originalRoleId) campNote = `Ancien rôle : ${ROLES[me.originalRoleId].name}. Vous appartenez désormais à la meute.`;

  // Vote
  let vote: PlayerView['vote'] = null;
  const v = game.vote;
  if (v && showRoles) {
    vote = {
      id: v.id,
      kind: v.kind,
      label: v.label,
      status: v.status,
      closesAt: v.closesAt,
      canVote: v.status === 'open' && me.alive && v.voters.includes(me.id),
      candidates: v.candidates.filter((id) => id !== me.id).map((id) => ({ id, name: nameOf(id) })),
      myBallot: v.ballots[me.id] ?? null,
      published:
        v.published && v.result
          ? { ...v.result, entries: v.result.entries.map((e) => ({ playerId: e.playerId, total: e.total, details: [] })), abstentions: [], notes: [] }
          : null,
    };
  }

  // Pouvoir du Loup Bavard (uniquement pour lui).
  let bavard: PlayerView['bavard'] = null;
  if (me.roleId === 'loupBavard' && game.status === 'running') {
    const pe = game.powers.bavardPending;
    bavard = {
      used: game.powers.loupBavardUsed,
      pending: pe ? { effect: pe.effect, voterName: nameOf(pe.targetVoterId), redirectName: pe.redirectTo ? nameOf(pe.redirectTo) : undefined } : null,
    };
  }

  // Action nocturne en cours que ce joueur peut enregistrer ?
  let action: PlayerView['action'] = null;
  const awake = game.night?.awake;
  if (awake && canPlayerAct(game, me.id, awake)) {
    const info = NIGHT_ACTIONS.find((a) => a.key === awake)!;
    const rec = game.night!.actions[awake];
    const aliveOthers = game.players.filter((p) => p.alive && p.id !== me.id).map((p) => ({ id: p.id, name: p.name }));
    const allAlive = game.players.filter((p) => p.alive).map((p) => ({ id: p.id, name: p.name }));
    const base = { key: awake, candidates: allAlive, recorded: !!rec };
    if (awake === 'cupidon') action = { ...base, kind: 'targets', max: 2 };
    else if (awake === 'chienLoup') action = { ...base, kind: 'choice', candidates: [], options: [{ value: 'village', label: '🏡 Rester avec les Villageois' }, { value: 'loups', label: '🐺 Rejoindre les Loups-Garous' }] };
    else if (awake === 'angeDechu') action = { ...base, kind: 'choice', candidates: [], options: [{ value: 'survie', label: '🕊 Survivre jusqu’à la fin' }, { value: 'elimination', label: '⚔ Être éliminé au premier vote' }] };
    else if (awake === 'loupNoir') action = { ...base, kind: 'choice', candidates: [], options: [{ value: 'transformer', label: '🌑 Transformer la victime' }, { value: 'non', label: 'Ne pas transformer' }], note: `Victime des loups : ${game.players.find((p) => p.id === game.night!.actions.loups?.targets[0])?.name ?? 'pas encore choisie'}` };
    else if (awake === 'sorciere') action = { ...base, kind: 'witch', candidates: aliveOthers, victims: nightVictims(game).map((id) => ({ id, name: game.players.find((p) => p.id === id)!.name })) };
    else if (awake === 'filleDeJoie') {
      const pw = game.powers;
      const banned = pw.filleDeJoieLastNight === game.night!.number - 1 ? pw.filleDeJoieLastHost : null;
      action = { ...base, kind: 'target', candidates: aliveOthers.filter((c) => c.id !== banned), note: banned ? `Vous ne pouvez pas retourner chez ${nameOf(banned)} cette nuit.` : 'Choisissez chez qui passer la nuit.' };
    }
    else if (awake === 'loupBavard') action = { ...base, kind: 'bavard', candidates: aliveOthers, options: [{ value: 'annuler', label: '🤐 Annuler son vote' }, { value: 'rediriger', label: '🗣 Rediriger son vote' }, { value: 'passer', label: 'Ne rien faire cette nuit' }], note: 'Une seule fois dans la partie : l’effet s’applique au prochain vote du village. Vous pouvez viser n’importe qui, loup compris.' };
    else if (awake === 'joueurDeFlute') action = { ...base, kind: 'targets', max: game.settings.piperCharmCount, candidates: aliveOthers };
    else if (info.role === 'pack') {
      const n = game.night!;
      const by = new Map<string, string[]>();
      for (const [w, t] of Object.entries(n.wolfSuggestions ?? {})) by.set(t, [...(by.get(t) ?? []), nameOf(w)]);
      action = {
        ...base, kind: 'pack', candidates: aliveOthers.filter((c) => !isPackMember(game, game.players.find((p) => p.id === c.id)!)),
        endsAt: n.wolfDeadline, mine: n.wolfSuggestions?.[me.id] ?? null,
        suggestions: [...by].map(([targetId, names]) => ({ targetId, by: names })),
        chosen: rec?.targets[0] ?? null,
      };
    }
    else if (awake === 'voyante' || awake === 'renard') action = { ...base, kind: 'target', candidates: aliveOthers };
    else action = { ...base, kind: 'target', candidates: allAlive };
  }

  // Chat de la meute : membres vivants uniquement, et seulement la nuit.
  let wolfChat: PlayerView['wolfChat'] = null;
  if (game.status === 'running' && me.alive && isPackMember(game, me)) {
    const open = game.phase === 'night' && !game.revealing && game.night?.awake === 'loups';
    wolfChat = {
      open,
      pack: game.players.filter((p) => p.alive && isPackMember(game, p)).map((p) => p.name),
      messages: open ? game.wolfChat.slice(-200) : [],
    };
  }

  const hunterTrigger = game.status === 'running' && game.phase === 'day' && !hidden.has(me.id) ? game.pendingTriggers.find((t) => t.type === 'hunter' && t.playerId === me.id) : undefined;
  const hunter: PlayerView['hunter'] = hunterTrigger
    ? { triggerId: hunterTrigger.id, candidates: game.players.filter((p) => p.alive && p.id !== me.id).map((p) => ({ id: p.id, name: p.name })) }
    : null;

  const chiefTrigger = game.status === 'running' && game.phase === 'day' ? game.pendingTriggers.find((t) => t.type === 'chief' && t.playerId === me.id) : undefined;
  const succession: PlayerView['succession'] = chiefTrigger
    ? { triggerId: chiefTrigger.id, candidates: game.players.filter((p) => p.alive && p.id !== me.id).map((p) => ({ id: p.id, name: p.name })) }
    : null;

  return {
    hunter,
    succession,
    game: {
      code: game.code,
      startedAt: game.createdAt,
      status: game.status,
      phase: game.phase,
      dayNumber: game.dayNumber,
      nightNumber: game.nightNumber,
      gmName: game.gmName,
      debate: game.status === 'running' && game.phase === 'day' ? game.debate ?? null : null,
      winner: game.winner,
      revealing: game.status === 'running' && !!game.revealing,
    },
    action,
    me: {
      id: me.id,
      name: me.name,
      alive: isAlive(me),
      roleId: showRoles ? me.roleId : null,
      originalRoleId: showRoles ? me.originalRoleId : null,
      isChief: game.chiefId === me.id,
      isWinner: ended && game.winnerIds.includes(me.id),
      // Les enchantés sont informés et se reconnaissent entre eux.
      charmed: game.status === 'running' && me.charmed,
      charmedPeers: game.status === 'running' && me.charmed ? game.players.filter((p) => p.alive && p.charmed && p.id !== me.id).map((p) => p.name) : [],
      camp: showRoles ? camp : null,
      campNote: showRoles ? campNote : null,
      whispers: me.whispers,
      lover: (() => {
        const l = showRoles ? game.powers.lovers : null;
        const other = l?.includes(me.id) ? game.players.find((p) => p.id === (l[0] === me.id ? l[1] : l[0])) : undefined;
        return other ? { id: other.id, name: other.name, alive: isAlive(other) } : null;
      })(),
      visions:
        showRoles && (me.roleId === 'voyante' || me.originalRoleId === 'voyante')
          ? (game.powers.seerVisions ?? []).map((v) => ({ ...v, name: nameOf(v.targetId) }))
          : [],
    },
    players: [...game.players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        alive: isAlive(p),
        connected: p.connected,
        isChief: game.chiefId === p.id,
        isWinner: ended && game.winnerIds.includes(p.id),
        revealedRoleId: (p.revealed || ended) && showRoles && !hidden.has(p.id) ? p.roleId : null,
      })),
    publicEvents: game.events.filter((e) => e.visibility === 'public').slice(-100),
    spectator: game.status === 'running' && !isAlive(me),
    vote,
    bavard,
    dawn:
      game.status === 'running' && game.phase === 'day' && game.night?.validated
        ? { day: game.dayNumber, deaths: game.night.deaths.map((id) => { const p = game.players.find((x) => x.id === id)!; const lv = game.powers.lovers;
            const partner = lv?.includes(id) ? (lv[0] === id ? lv[1] : lv[0]) : null;
            const loverOf = partner && p.deathReason?.includes('par Cupidon') ? game.players.find((x) => x.id === partner)?.name : undefined;
            return { id, name: p.name, roleId: p.revealed ? p.roleId : null, wasChief: game.night!.chiefDied === id, loverOf }; }) }
        : null,
    successionWaiting: (() => {
      const t = game.status === 'running' && game.phase === 'day' ? game.pendingTriggers.find((x) => x.type === 'chief') : undefined;
      return t ? game.players.find((p) => p.id === t.playerId)?.name ?? null : null;
    })(),
    verdict: (() => {
      const lv = game.lastVerdict;
      const p = lv && game.status === 'running' && game.phase === 'day' && lv.day === game.dayNumber ? game.players.find((x) => x.id === lv.playerId) : undefined;
      const q = lv?.loverId ? game.players.find((x) => x.id === lv.loverId) : undefined;
      return p ? { id: lv!.id, name: p.name, roleId: p.revealed ? p.roleId : null, lover: q ? { name: q.name, roleId: q.revealed ? q.roleId : null } : undefined } : null;
    })(),
    wolfChat,
  };
}
