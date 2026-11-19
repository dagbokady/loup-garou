import { io, type Socket } from 'socket.io-client';
import type { Ack } from '@shared/types';

/** Connexion Socket.IO unique pour toute l'application. */
export const socket: Socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

/** Émet un événement et attend l'acquittement du serveur. */
export function emit<T = unknown>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Le serveur ne répond pas.')), 10000);
    socket.emit(event, payload ?? {}, (res: Ack<T>) => {
      clearTimeout(timer);
      if (res?.ok) resolve(res.data as T);
      else reject(new Error(res?.error ?? 'Erreur inconnue.'));
    });
  });
}
