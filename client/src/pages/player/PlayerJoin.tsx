import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { PlayerView } from '@shared/types';
import { Background } from '../../components/Background';
import { emit } from '../../lib/socket';
import { storage } from '../../lib/storage';

/** Rejoindre une partie : code + pseudonyme, sans compte. */
export function PlayerJoin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const existing = storage.getPlayer();

  // Lien de reprise fourni par le Maître du jeu.
  useEffect(() => {
    const token = params.get('reprise');
    if (!token) return;
    emit<{ code: string; view: PlayerView }>('player:hello', { token })
      .then((res) => {
        storage.setPlayer({ token, code: res.code, name: res.view.me.name });
        nav('/jouer/partie', { replace: true });
      })
      .catch((e) => setError(e.message));
  }, [params, nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await emit<{ token: string; code: string }>('player:join', { code: code.trim(), name: name.trim() });
      storage.setPlayer({ token: res.token, code: res.code, name: name.trim() });
      nav('/jouer/partie');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Background mode="night" />
      <form onSubmit={submit} className="panel w-full max-w-md animate-rise p-6 sm:p-8">
        <Link to="/" className="font-title text-xs uppercase tracking-widest text-or-300/80 hover:text-or-200">← Retour</Link>
        <div className="mt-3 text-center text-5xl">🌕</div>
        <h1 className="mt-2 text-center font-display text-3xl text-gold">Entrer au village</h1>
        <div className="ornament">✦</div>

        {existing && (
          <Link to="/jouer/partie" className="mb-5 block rounded-lg border border-or-400/50 bg-or-500/10 p-3 text-center hover:bg-or-500/20">
            Reprendre ma session : <strong>{existing.name}</strong> · partie {existing.code}
          </Link>
        )}
        {existing && existing.code === code && (
          <p className="mb-4 text-center text-sm text-or-200">Vous êtes déjà inscrit(e) dans cette partie sur cet appareil : reprenez votre session ci-dessus.</p>
        )}

        <label className="label" htmlFor="code">Code de la partie</label>
        <input
          id="code"
          className="input text-center font-display text-3xl uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="XXXXXX"
          autoComplete="off"
          inputMode="text"
          required
          minLength={6}
        />
        <label className="label mt-4" htmlFor="name">Votre pseudonyme</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required autoComplete="nickname" placeholder="Ex. : Gaspard" />
        {error && <p className="mt-4 rounded-lg border border-sang-500/60 bg-sang-700/40 px-3 py-2">{error}</p>}
        <button className="btn-gold mt-6 w-full py-3" disabled={busy || code.length !== 6 || !name.trim() || existing?.code === code}>
          {busy ? '…' : 'Rejoindre la partie'}
        </button>
        <p className="mt-4 text-center text-sm text-parchemin-300/60">Aucun compte n’est nécessaire. Votre session est mémorisée sur cet appareil pour vous reconnecter.</p>
      </form>
    </div>
  );
}
