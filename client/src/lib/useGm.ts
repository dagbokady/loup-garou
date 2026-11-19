import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GmGameView, NightActionKey, VictoryCheck, WinnerCamp } from '@shared/types';
import { emit, socket } from './socket';
import { storage } from './storage';
import { useToast } from './toast';

export interface GmView extends GmGameView {
  availableActions: { key: NightActionKey; reason?: string }[];
  victoryChecks: VictoryCheck[];
  nightVictims: string[];
  winnersByCamp: Record<WinnerCamp, string[]>;
}

/** État temps réel du Maître du jeu + envoi d'actions. */
export function useGm() {
  const nav = useNavigate();
  const toast = useToast();
  const [game, setGame] = useState<GmView | null>(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const session = storage.getGm();

  useEffect(() => {
    if (!session) {
      nav('/mj', { replace: true });
      return;
    }
    const hello = () =>
      emit<{ gmName: string; game: GmView | null }>('gm:hello', { token: session.token })
        .then((res) => {
          setGame(res.game);
          setReady(true);
        })
        .catch((e) => {
          toast(e.message, 'error');
          storage.setGm(null);
          nav('/mj', { replace: true });
        });
    const onState = (g: GmView) => setGame(g);
    const onConnect = () => { setConnected(true); hello(); };
    const onDisconnect = () => setConnected(false);
    socket.on('gm:state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) hello();
    return () => {
      socket.off('gm:state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = useCallback(
    async <T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: T }> => {
      try {
        return { ok: true, data: await emit<T>('gm:action', { type, ...payload }) };
      } catch (e) {
        toast((e as Error).message, 'error');
        return { ok: false };
      }
    },
    [toast],
  );

  const createGame = useCallback(
    async (expectedPlayers: number) => {
      try {
        setGame(await emit<GmView>('gm:createGame', { expectedPlayers }));
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [toast],
  );

  const logout = () => {
    storage.setGm(null);
    nav('/');
  };

  const rematch = useCallback(async () => {
    try {
      setGame(await emit<GmView>('gm:rematch', {}));
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { game, ready, connected, act, createGame, rematch, logout, username: session?.username ?? '' };
}

export type GmApi = ReturnType<typeof useGm>;
