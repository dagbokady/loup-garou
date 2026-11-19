/**
 * Point d'entrée du serveur : API HTTP (auth MJ, archives, export/import)
 * + Socket.IO (temps réel) + fichiers statiques du client en production.
 */
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Server } from 'socket.io';
import { AuthError, issueToken, login, register, verifyToken, type GmAccount } from './accounts.ts';
import { deleteArchive, getArchive, importArchive, summaries } from './archives.ts';
import { CLIENT_DIST, GM_INVITE_CODE, IS_PROD, PORT } from './config.ts';
import { toArchive } from './game/engine.ts';
import { registry } from './game/registry.ts';
import { PresetError, deletePreset, listPresets, savePreset } from './presets.ts';
import { attachSockets } from './socket.ts';

registry.load();
// Sauvegarde immédiate des parties en cours si le serveur s'arrête.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { registry.flush(); process.exit(0); });
process.on('uncaughtException', (e) => { console.error(e); registry.flush(); process.exit(1); });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '3mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

type AuthedRequest = express.Request & { gm?: GmAccount };
const requireGm: express.RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const account = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!account) return void res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
  (req as AuthedRequest).gm = account;
  next();
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Développement : parties en salle d'attente (la plus récente d'abord), pour `npm run bots`.
if (process.env.NODE_ENV !== 'production')
  app.get('/api/dev/lobbies', (_req, res) => res.json(registry.all().filter((g) => g.status === 'lobby')
    .sort((a, b) => b.createdAt - a.createdAt).map((g) => ({ code: g.code, gm: g.gmName, players: g.players.length, createdAt: g.createdAt }))));

/**
 * Adresses IPv4 de cette machine sur le réseau local (pour le QR code des joueurs).
 * Les plages privées classiques (192.168.x, 10.x, 172.16-31.x) passent en premier.
 */
function lanAddresses(): string[] {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  const rank = (ip: string) =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return [...new Set(ips)].sort((a, b) => rank(a) - rank(b));
}
app.get('/api/network', (_req, res) => res.json({ addresses: lanAddresses() }));
app.get('/api/auth/config', (_req, res) => res.json({ inviteRequired: !!GM_INVITE_CODE }));

app.post('/api/auth/register', (req, res) => {
  try {
    if (GM_INVITE_CODE && req.body?.inviteCode !== GM_INVITE_CODE) throw new AuthError('Code d’invitation invalide.');
    const account = register(req.body?.username, req.body?.password);
    res.json({ token: issueToken(account), username: account.username });
  } catch (e) {
    res.status(400).json({ error: e instanceof AuthError ? e.message : 'Inscription impossible.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const account = login(req.body?.username, req.body?.password, req.ip ?? '');
    res.json({ token: issueToken(account), username: account.username });
  } catch (e) {
    res.status(401).json({ error: e instanceof AuthError ? e.message : 'Connexion impossible.' });
  }
});

app.get('/api/auth/me', requireGm, (req, res) => res.json({ username: (req as AuthedRequest).gm!.username }));

app.get('/api/archives', requireGm, (req, res) => res.json(summaries((req as AuthedRequest).gm!.id)));

app.get('/api/archives/:id', requireGm, (req, res) => {
  const a = getArchive((req as AuthedRequest).gm!.id, req.params.id);
  if (!a) return void res.status(404).json({ error: 'Partie introuvable.' });
  res.json(a);
});

app.delete('/api/archives/:id', requireGm, (req, res) => {
  const ok = deleteArchive((req as AuthedRequest).gm!.id, req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

app.post('/api/archives/import', requireGm, (req, res) => {
  try {
    const a = importArchive((req as AuthedRequest).gm!.id, req.body);
    res.json({ id: a.id });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message || 'Import impossible.' });
  }
});

app.get('/api/presets', requireGm, (req, res) => res.json(listPresets((req as AuthedRequest).gm!.id)));

app.post('/api/presets', requireGm, (req, res) => {
  try {
    res.json(savePreset((req as AuthedRequest).gm!.id, req.body?.name, req.body?.composition));
  } catch (e) {
    res.status(400).json({ error: e instanceof PresetError ? e.message : 'Enregistrement impossible.' });
  }
});

app.delete('/api/presets/:id', requireGm, (req, res) => {
  const ok = deletePreset((req as AuthedRequest).gm!.id, req.params.id);
  res.status(ok ? 200 : 404).json({ ok });
});

/** Export JSON de la partie en mémoire (active ou dernière terminée), sans jetons secrets. */
app.get('/api/games/current/export', requireGm, (req, res) => {
  const gm = (req as AuthedRequest).gm!;
  const game = registry.activeForGm(gm.id) ?? registry.latestForGm(gm.id);
  if (!game) return void res.status(404).json({ error: 'Aucune partie.' });
  res.json({ format: 'loup-garou/1', exportedAt: Date.now(), game: { ...toArchive(game), status: game.status, powers: game.powers } });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue.' }));

// Client compilé (production).
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: IS_PROD ? '1h' : 0, index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, { cors: IS_PROD ? undefined : { origin: true }, maxHttpBufferSize: 1e5 });
attachSockets(io);

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log(`🐺 Serveur Loup-Garou sur http://localhost:${PORT}`);
  for (const ip of ips) console.log(`   Réseau local : http://${ip}:${PORT}`);
});
