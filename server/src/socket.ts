/**
 * Couche temps réel (Socket.IO).
 * Chaque événement vérifie l'identité côté serveur avant d'agir :
 *  - Maître du jeu : jeton de session signé, et la partie doit lui appartenir ;
 *  - Joueur : jeton de reconnexion imprévisible, lié à une seule partie.
 */
import type { Server, Socket } from 'socket.io';
import type { Ack, NightActionKey } from '../../shared/types.ts';
import { verifyToken } from './accounts.ts';
import { saveArchive } from './archives.ts';
import * as E from './game/engine.ts';
import { registry } from './game/registry.ts';
import { gmView, playerView } from './game/views.ts';

type Reply = (res: Ack<unknown>) => void;

interface SocketData {
  gmId?: string;
  gmName?: string;
  playerId?: string;
  gameId?: string;
  lastChat?: number;
}

const gmRoom = (gmId: string) => `gm:${gmId}`;
const playerRoom = (playerId: string) => `p:${playerId}`;

export function attachSockets(io: Server) {
  /** Diffuse l'état à tous les participants d'une partie (une vue par personne). */
  const broadcast = (game: E.Game) => {
    // Victoire atteinte : la partie se termine d'elle-même et part aux archives.
    if (E.autoVictory(game)) saveArchive(game.gmId, E.toArchive(game));
    io.to(gmRoom(game.gmId)).emit('gm:state', gmView(game));
    for (const p of game.players) {
      const view = playerView(game, p.id);
      if (view) io.to(playerRoom(p.id)).emit('player:state', view);
    }
    registry.save();
  };

  const refreshConnected = (game: E.Game) => {
    for (const p of game.players) p.connected = (io.sockets.adapter.rooms.get(playerRoom(p.id))?.size ?? 0) > 0;
  };

  const safe = (reply: unknown, fn: () => unknown) => {
    const cb: Reply = typeof reply === 'function' ? (reply as Reply) : () => {};
    try {
      const data = fn();
      cb({ ok: true, data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inattendue.';
      if (!(e instanceof E.GameError)) console.error(e);
      cb({ ok: false, error: msg });
    }
  };

  // Chrono de la meute : à échéance, la proie la plus suggérée est validée.
  setInterval(() => {
    const now = Date.now();
    for (const game of registry.all()) {
      const d = game.night?.wolfDeadline;
      if (game.status === 'running' && d && d <= now) {
        try { if (E.resolveWolfVote(game)) broadcast(game); } catch (e) { console.error(e); }
      }
    }
  }, 500);

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;

    /* ---------------------- Maître du jeu ---------------------- */

    socket.on('gm:hello', (payload: { token?: string }, reply) =>
      safe(reply, () => {
        const account = verifyToken(payload?.token);
        if (!account) throw new E.GameError('Session expirée. Reconnectez-vous.');
        data.gmId = account.id;
        data.gmName = account.username;
        socket.join(gmRoom(account.id));
        const game = registry.activeForGm(account.id) ?? registry.latestForGm(account.id);
        return { gmName: account.username, game: game ? gmView(game) : null };
      }),
    );

    const requireGm = () => {
      if (!data.gmId) throw new E.GameError('Authentification du Maître du jeu requise.');
      return data.gmId;
    };

    socket.on('gm:createGame', (payload: { expectedPlayers?: number }, reply) =>
      safe(reply, () => {
        const gmId = requireGm();
        let game: E.Game;
        try {
          game = registry.create(gmId, data.gmName ?? 'MJ', Number(payload?.expectedPlayers ?? 8));
        } catch (e) {
          throw new E.GameError((e as Error).message);
        }
        broadcast(game);
        return gmView(game);
      }),
    );

    socket.on('gm:rematch', (_payload: unknown, reply) =>
      safe(reply, () => {
        const gmId = requireGm();
        let game: E.Game;
        try {
          game = registry.rematch(gmId, (g) => E.rematch(g));
        } catch (e) {
          throw new E.GameError((e as Error).message);
        }
        broadcast(game);
        return gmView(game);
      }),
    );

    socket.on('gm:action', (payload: { type: string; [k: string]: unknown }, reply) =>
      safe(reply, () => {
        const gmId = requireGm();
        const game = registry.activeForGm(gmId);
        if (!game) throw new E.GameError('Aucune partie active.');
        const p = payload ?? { type: '' };
        const s = (k: string) => String(p[k] ?? '');
        let result: unknown;
        switch (p.type) {
          case 'settings': E.updateSettings(game, p.settings as never); break;
          case 'composition': E.setComposition(game, p.composition as never); break;
          case 'reorder': E.reorderPlayers(game, p.ids as string[]); break;
          case 'kick': {
            const pid = s('playerId');
            E.removePlayer(game, pid);
            io.to(playerRoom(pid)).emit('player:kicked');
            io.in(playerRoom(pid)).socketsLeave(playerRoom(pid));
            break;
          }
          case 'distribute': E.distributeRandom(game); break;
          case 'assignRole': E.assignRole(game, s('playerId'), (p.roleId as never) ?? null); break;
          case 'clearRoles': E.clearRoles(game); break;
          case 'start': E.startGame(game); break;
          case 'closeReveal': E.closeReveal(game); break;
          case 'startNight': E.startNight(game); break;
          case 'startDay': E.startDay(game); break;
          case 'wake': E.wake(game, (p.key as NightActionKey) ?? null); break;
          case 'recordAction': throw new E.GameError('Seul le joueur concerné peut faire ce choix depuis son téléphone.');
          case 'clearAction': E.clearAction(game, p.key as NightActionKey); break;
          case 'validateNight':
            E.validateNight(game, p.checked as string[], p.extraDeaths as never, true);
            break;
          case 'eliminate': E.eliminate(game, s('playerId'), s('reason'), true, p.cause === 'vote' ? 'vote' : undefined); break;
          case 'revive': E.revive(game, s('playerId')); break;
          case 'resolveTrigger': E.resolveTrigger(game, s('triggerId'), (p.targetId as string) || null); break;
          case 'setChief': E.setChief(game, (p.playerId as string) || null); break;
          case 'setCharmed': E.setCharmed(game, s('playerId'), !!p.charmed); break;
          case 'debate': E.setDebate(game, p.seconds, !!p.extend); break;
        case 'openVote': E.openVote(game, p as never); break;
          case 'closeVote': E.closeVote(game); E.publishVote(game); break;
          case 'publishVote': E.publishVote(game); break;
          case 'resolveVoteTie': E.resolveVoteTie(game, s('playerId')); break;
          case 'dismissVote': E.dismissVote(game); break;
          case 'whisper': E.sendWhisper(game, s('playerId'), s('text')); break;
          case 'announce': E.announce(game, s('text')); break;
          case 'playerLink': {
            // Lien de reconnexion d'un joueur (le MJ connaît déjà tous les secrets).
            const pl = E.getPlayer(game, s('playerId'));
            result = { token: pl.token };
            break;
          }
          case 'end':
          case 'cancel': {
            E.endGame(game, s('winner'), p.type === 'cancel', p.winnerIds as string[]);
            saveArchive(gmId, E.toArchive(game));
            break;
          }
          default:
            throw new E.GameError('Action inconnue.');
        }
        broadcast(game);
        return result;
      }),
    );

    /* ------------------------- Joueurs ------------------------- */

    const bindPlayer = (game: E.Game, playerId: string) => {
      if (data.playerId && data.playerId !== playerId) socket.leave(playerRoom(data.playerId));
      // Un jeton = une seule connexion active : l'ancienne session est fermée.
      for (const other of io.sockets.adapter.rooms.get(playerRoom(playerId)) ?? []) {
        if (other === socket.id) continue;
        const s = io.sockets.sockets.get(other);
        if (!s) continue;
        s.emit('player:replaced');
        s.leave(playerRoom(playerId));
        (s.data as SocketData).playerId = undefined;
        (s.data as SocketData).gameId = undefined;
      }
      data.playerId = playerId;
      data.gameId = game.id;
      socket.join(playerRoom(playerId));
      refreshConnected(game);
      broadcast(game);
    };

    socket.on('player:join', (payload: { code?: string; name?: string }, reply) =>
      safe(reply, () => {
        const game = registry.byCode(String(payload?.code ?? ''));
        if (!game) throw new E.GameError('Aucune partie ne correspond à ce code.');
        if (game.status !== 'lobby') throw new E.GameError('Cette partie a déjà commencé : les inscriptions sont closes.');
        const player = E.addPlayer(game, payload?.name);
        bindPlayer(game, player.id);
        return { token: player.token, code: game.code, view: playerView(game, player.id) };
      }),
    );

    socket.on('player:hello', (payload: { token?: string }, reply) =>
      safe(reply, () => {
        const found = registry.byPlayerToken(String(payload?.token ?? ''));
        if (!found) throw new E.GameError('Session introuvable : la partie est peut-être terminée.');
        bindPlayer(found.game, found.playerId);
        return { code: found.game.code, view: playerView(found.game, found.playerId) };
      }),
    );

    const requirePlayer = () => {
      const game = data.gameId ? registry.byId(data.gameId) : null;
      if (!game || !data.playerId || !game.players.some((p) => p.id === data.playerId))
        throw new E.GameError('Session de joueur invalide.');
      return { game, playerId: data.playerId };
    };

    socket.on('player:ballot', (payload: { targetId?: string | null }, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        E.castBallot(game, playerId, payload?.targetId ? String(payload.targetId) : null);
        // Tous les votants en vie ont voté : clôture et résultats immédiats.
        const v = game.vote;
        if (v && v.status === 'open' && v.voters.every((id) => v.ballots[id] || !game.players.find((p) => p.id === id)?.alive)) {
          E.closeVote(game);
          E.publishVote(game);
        }
        broadcast(game);
      }),
    );

    socket.on('player:wolfChat', (payload: { text?: string }, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        const now = Date.now();
        if (data.lastChat && now - data.lastChat < 300) throw new E.GameError('Doucement…');
        data.lastChat = now;
        E.wolfChatSend(game, playerId, String(payload?.text ?? ''));
        broadcast(game);
      }),
    );

    socket.on('player:hunterShot', (payload: { targetId?: string }, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        E.hunterShoot(game, playerId, String(payload?.targetId ?? ''));
        broadcast(game);
      }),
    );

    socket.on('player:chiefSuccessor', (payload: { targetId?: string }, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        E.chiefSuccession(game, playerId, String(payload?.targetId ?? ''));
        broadcast(game);
      }),
    );

    socket.on('player:wolfSuggest', (payload: { targetId?: string | null }, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        E.wolfSuggest(game, playerId, payload?.targetId ? String(payload.targetId) : null);
        broadcast(game);
      }),
    );

    // Action nocturne enregistrée directement depuis le téléphone du joueur.
    socket.on('player:action', (payload: { key?: string; action?: Partial<import('../../shared/types.ts').NightActionRecord> }, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        const key = String(payload?.key ?? '') as import('../../shared/types.ts').NightActionKey;
        if (key === 'loups') throw new E.GameError('La meute choisit par suggestions, à la fin du chrono.');
        if (!E.canPlayerAct(game, playerId, key)) throw new E.GameError('Action non autorisée.');
        if ((key === 'voyante' || key === 'renard') && (payload?.action?.targets ?? []).includes(playerId)) throw new E.GameError('Choisissez un autre joueur que vous.');
        E.recordAction(game, key, payload?.action ?? {});
        broadcast(game);
      }),
    );

    // Le joueur a retourné sa carte pendant la période de révélation (suivi pour le MJ).
    socket.on('player:sawCard', (_p, reply) =>
      safe(reply, () => {
        const { game, playerId } = requirePlayer();
        if (!game.revealing || game.sawCard?.includes(playerId)) return;
        E.markCardSeen(game, playerId);
        broadcast(game);
      }),
    );

    socket.on('player:leave', (_p, reply) =>
      safe(reply, () => {
        if (data.playerId) socket.leave(playerRoom(data.playerId));
        const game = data.gameId ? registry.byId(data.gameId) : null;
        data.playerId = undefined;
        data.gameId = undefined;
        if (game) { refreshConnected(game); broadcast(game); }
      }),
    );

    socket.on('disconnect', () => {
      const game = data.gameId ? registry.byId(data.gameId) : null;
      if (game) {
        refreshConnected(game);
        broadcast(game);
      }
    });
  });
}
