import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Background } from '../../components/Background';
import { api } from '../../lib/api';
import { storage } from '../../lib/storage';

/** Connexion / inscription du Maître du jeu. */
export function GmLogin() {
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteRequired, setInviteRequired] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (storage.getGm()) {
      api('/api/auth/me').then(() => nav('/mj/table', { replace: true })).catch(() => storage.setGm(null));
    }
    api<{ inviteRequired: boolean }>('/api/auth/config').then((c) => setInviteRequired(c.inviteRequired)).catch(() => {});
  }, [nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api<{ token: string; username: string }>(`/api/auth/${mode}`, {
        method: 'POST',
        json: { username, password, inviteCode },
      });
      storage.setGm(res);
      nav('/mj/table');
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
        <Link to="/" className="font-title text-xs uppercase tracking-widest text-or-300/80 hover:text-or-200">← Retour au village</Link>
        <img src="/assets/grimoire.webp" alt="" className="mx-auto mt-2 w-32 drop-shadow-[0_0_20px_rgba(124,77,204,0.6)]" />
        <h1 className="text-center font-display text-3xl text-gold">Maître du jeu</h1>
        <div className="ornament">✦</div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-or-500/30 bg-nuit-950/60 p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(''); }}
              className={`rounded-md py-2 font-title text-xs font-bold uppercase tracking-wider transition ${mode === m ? 'bg-or-400/90 text-nuit-950' : 'text-or-200 hover:bg-nuit-800'}`}
            >
              {m === 'login' ? 'Connexion' : 'Créer un compte'}
            </button>
          ))}
        </div>

        <label className="label" htmlFor="u">Identifiant</label>
        <input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} />
        <label className="label mt-4" htmlFor="p">Mot de passe</label>
        <input
          id="p"
          className="input"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'register' ? 8 : 1}
        />
        {mode === 'register' && (
          <p className="mt-1 text-sm text-parchemin-300/70">8 caractères minimum. Le mot de passe est haché sur le serveur, jamais stocké en clair.</p>
        )}
        {mode === 'register' && inviteRequired && (
          <>
            <label className="label mt-4" htmlFor="i">Code d’invitation</label>
            <input id="i" className="input" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
          </>
        )}
        {error && <p className="mt-4 rounded-lg border border-sang-500/60 bg-sang-700/40 px-3 py-2 text-parchemin-50">{error}</p>}
        <button className="btn-gold mt-6 w-full py-3" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Entrer dans la salle du conseil' : 'Créer mon compte'}
        </button>
      </form>
    </div>
  );
}
