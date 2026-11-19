import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@shared/types';
import { emit, socket } from './socket';
import { storage } from './storage';
import { useToast } from './toast';

/** État temps réel d'un joueur, avec reconnexion automatique par jeton. */
export function usePlayer() {
  const toast = useToast();
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const replacedRef = useRef(false);
  const [connected, setConnected] = useState(socket.connected);
  const session = storage.getPlayer();

  useEffect(() => {
    if (!session) return;
    const hello = () =>
      emit<{ code: string; view: PlayerView }>('player:hello', { token: session.token })
        .then((res) => { setView(res.view); setError(null); })
        .catch((e) => setError(e.message));
    const onState = (v: PlayerView) => setView(v);
    const onKicked = () => { setKicked(true); storage.setPlayer(null); };
    // Le même jeton a été utilisé ailleurs : cette session est fermée.
    const onReplaced = () => { replacedRef.current = true; setReplaced(true); };
    socket.on('player:replaced', onReplaced);
    const onConnect = () => { setConnected(true); if (!replacedRef.current) hello(); };
    const onDisconnect = () => setConnected(false);
    socket.on('player:state', onState);
    socket.on('player:kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) hello();
    // Téléphone sorti de veille : on relance la connexion sans attendre le délai de Socket.IO.
    const onVisible = () => { if (document.visibilityState === 'visible' && !socket.connected) socket.connect(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      socket.off('player:state', onState);
      socket.off('player:kicked', onKicked);
      socket.off('player:replaced', onReplaced);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(
    async (event: string, payload: unknown) => {
      try {
        await emit(event, payload);
        return true;
      } catch (e) {
        toast((e as Error).message, 'error');
        return false;
      }
    },
    [toast],
  );

  /** Reprendre la session sur cet appareil (ferme l'autre). */
  const resume = () => {
    if (!session) return;
    emit<{ view: PlayerView }>('player:hello', { token: session.token })
      .then((res) => { setView(res.view); setReplaced(false); replacedRef.current = false; })
      .catch((e) => setError(e.message));
  };

  const leave = () => {
    emit('player:leave').catch(() => {});
    storage.setPlayer(null);
  };

  return { session, view, error, kicked, replaced, connected, send, leave, resume };
}
