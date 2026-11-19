import { useEffect, useState } from 'react';
import { api } from './api';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
const KEY = 'lg.lanAddress';

/**
 * Adresse à partager avec les joueurs (QR code, liens).
 * Si le MJ a ouvert l'app via « localhost », on la remplace par l'IP de la machine
 * sur le réseau local, avec le même port : les téléphones du même Wi-Fi peuvent l'ouvrir.
 */
export function usePublicOrigin() {
  const { protocol, hostname, port, origin } = window.location;
  const isLocal = LOCAL_HOSTS.includes(hostname);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  });

  useEffect(() => {
    if (!isLocal) return;
    api<{ addresses: string[] }>('/api/network')
      .then((r) => setAddresses(r.addresses))
      .catch(() => setAddresses([]));
  }, [isLocal]);

  const choose = (ip: string) => {
    setSelected(ip);
    try { localStorage.setItem(KEY, ip); } catch { /* stockage indisponible */ }
  };

  if (!isLocal) return { origin, addresses: [], current: hostname, choose, isLocal, missing: false };
  const ip = selected && addresses.includes(selected) ? selected : addresses[0];
  return {
    origin: ip ? `${protocol}//${ip}${port ? `:${port}` : ''}` : origin,
    addresses,
    current: ip ?? hostname,
    choose,
    isLocal,
    /** Aucune adresse réseau trouvée : la machine n'est connectée à aucun réseau. */
    missing: addresses.length === 0,
  };
}
