/**
 * Test d'intégration : un Maître du jeu et 5 joueurs connectés en Socket.IO.
 * Vérifie la confidentialité des rôles, le chat de la meute, la nuit, les votes
 * (Chef ×2, Corbeau +2, Loup Bavard), les archives et l'export/import.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc, type Socket } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
process.env.PORT = String(PORT);
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lg-test-'));
process.env.PERSIST_ACTIVE = '0';
process.env.WOLF_SECONDS = '1';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const sockets: Socket[] = [];
const connect = () =>
  new Promise<Socket>((res) => {
    const s = ioc(URL, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('connect', () => res(s));
  });
const emit = (s: Socket, ev: string, payload: unknown = {}) =>
  new Promise<Any>((res) => s.emit(ev, payload, (r: Any) => res(r)));
const ok = async (s: Socket, ev: string, payload: unknown = {}) => {
  const r = await emit(s, ev, payload);
  assert.equal(r.ok, true, `${ev} ${JSON.stringify(payload)} → ${r.error}`);
  return r.data;
};
const fail = async (s: Socket, ev: string, payload: unknown, re?: RegExp) => {
  const r = await emit(s, ev, payload);
  assert.equal(r.ok, false, `${ev} aurait dû échouer`);
  if (re) assert.match(r.error, re);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let gmToken = '';
before(async () => {
  await import('../src/index.ts');
  await wait(300);
});
after(() => {
  sockets.forEach((s) => s.close());
  setTimeout(() => process.exit(0), 100);
});

test('partie complète', async () => {
  // Inscription du MJ (mot de passe haché, jamais renvoyé)
  const reg = await fetch(`${URL}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'narrateur', password: 'motdepasse123' }),
  }).then((r) => r.json());
  gmToken = reg.token;
  assert.ok(gmToken);
  const accounts = fs.readFileSync(path.join(process.env.DATA_DIR!, 'accounts.json'), 'utf8');
  assert.ok(!accounts.includes('motdepasse123'), 'mot de passe en clair !');
  const bad = await fetch(`${URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'narrateur', password: 'faux' }) });
  assert.equal(bad.status, 401);

  const gm = await connect();
  await fail(gm, 'gm:hello', { token: 'bidon' });
  await ok(gm, 'gm:hello', { token: gmToken });
  const game = await ok(gm, 'gm:createGame', { expectedPlayers: 5 });
  await fail(gm, 'gm:createGame', { expectedPlayers: 5 }, /déjà une partie active/);

  // 5 joueurs rejoignent
  const names = ['Alice', 'Bruno', 'Chloé', 'David', 'Émile'];
  const P: Record<string, { s: Socket; token: string; id: string }> = {};
  for (const n of names) {
    const s = await connect();
    const r = await ok(s, 'player:join', { code: game.code.toLowerCase(), name: n });
    P[n] = { s, token: r.token, id: r.view.me.id };
  }
  const intrus = await connect();
  await fail(intrus, 'player:join', { code: game.code, name: 'alice' }, /déjà pris/);
  await fail(intrus, 'player:join', { code: 'ZZZZZZ', name: 'X' }, /Aucune partie/);
  // Un joueur ne peut pas agir comme MJ
  await fail(P.Alice.s, 'gm:action', { type: 'start' }, /Maître du jeu/);

  // Composition + distribution manuelle
  await ok(gm, 'gm:action', { type: 'composition', composition: { loup: 1, loupBavard: 1, voyante: 1, corbeau: 1, villageois: 1 } });
  await fail(gm, 'gm:action', { type: 'composition', composition: { voyante: 2 } }, /qu’une fois/);
  const roles: Record<string, string> = { Alice: 'loup', Bruno: 'loupBavard', Chloé: 'voyante', David: 'corbeau', Émile: 'villageois' };
  for (const n of names) await ok(gm, 'gm:action', { type: 'assignRole', playerId: P[n].id, roleId: roles[n] });
  await ok(gm, 'gm:action', { type: 'start' });
  await ok(P.Alice.s, 'player:sawCard');
  await ok(gm, 'gm:action', { type: 'closeReveal' });
  const chloeView = (await ok(P.Chloé.s, 'player:hello', { token: P.Chloé.token })).view;

  // Confidentialité : Chloé ne voit que son rôle
  assert.equal(chloeView.me.roleId, 'voyante');
  assert.ok(chloeView.players.every((p: Any) => p.revealedRoleId === null));
  const raw = JSON.stringify(chloeView);
  for (const n of names) assert.ok(!raw.includes(P[n].token), 'jeton divulgué');
  assert.ok(!raw.includes('loupBavard') && !raw.includes('"corbeau"'), 'rôle d’un autre joueur divulgué');
  assert.equal(chloeView.wolfChat, null);

  // Le MJ ne reçoit pas les jetons
  await ok(gm, 'gm:action', { type: 'wake', key: 'loups' });
  const gmV = await ok(gm, 'gm:hello', { token: gmToken });
  for (const n of names) assert.ok(!JSON.stringify(gmV).includes(P[n].token));

  // Chat de la meute : loups uniquement, la nuit
  await ok(P.Alice.s, 'player:wolfChat', { text: 'On mange Émile ?' });
  await fail(P.Chloé.s, 'player:wolfChat', { text: 'coucou' }, /Accès refusé/);
  const bView = await ok(P.Bruno.s, 'player:hello', { token: P.Bruno.token });
  assert.equal(bView.view.wolfChat.messages[0].text, 'On mange Émile ?');
  assert.deepEqual(bView.view.wolfChat.pack.sort(), ['Alice', 'Bruno']);

  // Nuit 1 = nuit de préparation : aucune attaque possible
  await fail(P.Alice.s, 'player:wolfSuggest', { targetId: P.Émile.id }, /pas réveillée/);
  // Le MJ ne peut jamais choisir à la place d'un joueur
  await fail(gm, 'gm:action', { type: 'recordAction', key: 'loups', action: { targets: [P.Émile.id] } }, /Seul le joueur/);
  await ok(gm, 'gm:action', { type: 'validateNight', checked: [] });
  await ok(gm, 'gm:action', { type: 'startNight' }); // passage direct à la nuit 2
  // Nuit 2
  await ok(gm, 'gm:action', { type: 'wake', key: 'loups' });
  // La meute suggère ; à la fin du chrono, la proie la plus suggérée est retenue.
  await fail(P.Alice.s, 'player:action', { key: 'loups', action: { targets: [P.Émile.id] } }, /suggestions/);
  await ok(P.Alice.s, 'player:wolfSuggest', { targetId: P.Chloé.id });
  await ok(P.Bruno.s, 'player:wolfSuggest', { targetId: P.Émile.id });
  await ok(P.Alice.s, 'player:wolfSuggest', { targetId: P.Émile.id });
  const packView = (await ok(P.Bruno.s, 'player:hello', { token: P.Bruno.token })).view;
  assert.equal(packView.action.kind, 'pack');
  assert.deepEqual(packView.action.suggestions.find((x: Any) => x.targetId === P.Émile.id).by.sort(), ['Alice', 'Bruno']);
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal((await ok(P.Bruno.s, 'player:hello', { token: P.Bruno.token })).view.action.chosen, P.Émile.id);
  await ok(gm, 'gm:action', { type: 'wake', key: 'voyante' });
  await fail(P.Chloé.s, 'player:action', { key: 'voyante', action: { targets: [P.Chloé.id] } }, /autre joueur/);
  await ok(P.Chloé.s, 'player:action', { key: 'voyante', action: { targets: [P.Alice.id] } });
  await ok(gm, 'gm:action', { type: 'wake', key: 'corbeau' });
  await ok(P.David.s, 'player:action', { key: 'corbeau', action: { targets: [P.Alice.id] } });
  // Loup Bavard : appelé la nuit, il prépare l'effet du prochain vote (une seule fois).
  await ok(gm, 'gm:action', { type: 'wake', key: 'loupBavard' });
  await fail(P.Alice.s, 'player:action', { key: 'loupBavard', action: { choice: 'annuler', targets: [P.David.id] } }, /autorisée/);
  await fail(P.Bruno.s, 'player:action', { key: 'loupBavard', action: { choice: 'rediriger', targets: [P.David.id] } }, /vers qui/);
  await ok(P.Bruno.s, 'player:action', { key: 'loupBavard', action: { choice: 'rediriger', targets: [P.David.id, P.Chloé.id] } });
  const bNight = (await ok(P.Bruno.s, 'player:hello', { token: P.Bruno.token })).view;
  assert.equal(bNight.action.kind, 'bavard');
  await fail(gm, 'gm:action', { type: 'startDay' }, /Validez/);
  const g2 = await ok(gm, 'gm:hello', { token: gmToken });
  const cons = g2.game.proposedConsequences;
  assert.ok(cons.some((c: Any) => c.kind === 'death' && c.playerId === P.Émile.id));
  // La Voyante voit la carte immédiatement sur son téléphone (pas de murmure à l'aube).
  const seerNow = (await ok(P.Chloé.s, 'player:hello', { token: P.Chloé.token })).view;
  assert.equal(seerNow.me.visions[0].roleId, 'loup');
  assert.equal(seerNow.me.visions[0].name, 'Alice');
  assert.deepEqual((await ok(P.Bruno.s, 'player:hello', { token: P.Bruno.token })).view.me.visions, []);
  // Rien n'est appliqué tant que le MJ n'a pas validé
  assert.ok(g2.game.players.find((p: Any) => p.id === P.Émile.id).alive);
  await ok(gm, 'gm:action', { type: 'validateNight', checked: cons.filter((c: Any) => c.checked && !c.informative).map((c: Any) => c.id) });

  // Coupure réseau en pleine nuit : Émile (tué cette nuit) perd la connexion puis revient.
  P.Émile.s.close();
  await wait(200);
  assert.equal((await ok(gm, 'gm:hello', { token: gmToken })).game.players.find((p: Any) => p.id === P.Émile.id).connected, false);
  P.Émile.s = await connect();
  const back = (await ok(P.Émile.s, 'player:hello', { token: P.Émile.token })).view;
  assert.equal(back.me.roleId, 'villageois', 'carte retrouvée après reconnexion');
  // La mort reste secrète jusqu'au lever du jour, même pour la victime et les autres joueurs.
  assert.equal(back.me.alive, true);
  assert.equal(back.spectator, false);
  const nightOther = (await ok(P.Chloé.s, 'player:hello', { token: P.Chloé.token })).view;
  const emNight = nightOther.players.find((p: Any) => p.id === P.Émile.id);
  assert.equal(emNight.alive, true);
  assert.equal(emNight.revealedRoleId, null);
  assert.equal(nightOther.dawn, null);
  assert.equal((await ok(gm, 'gm:hello', { token: gmToken })).game.players.find((p: Any) => p.id === P.Émile.id).connected, true);

  await ok(gm, 'gm:action', { type: 'startDay' });
  // Au matin, tout le monde reçoit la liste des morts pour la révélation des cartes.
  const dawnView = (await ok(P.Chloé.s, 'player:hello', { token: P.Chloé.token })).view;
  assert.deepEqual(dawnView.dawn.deaths.map((d: Any) => [d.name, d.roleId]), [['Émile', 'villageois']]);
  await wait(350);
  await fail(P.Alice.s, 'player:wolfChat', { text: 'jour' }, /que la nuit/);

  const eView = (await ok(P.Émile.s, 'player:hello', { token: P.Émile.token })).view;
  assert.equal(eView.me.alive, false);
  assert.equal(eView.spectator, true);
  const cView = (await ok(P.Chloé.s, 'player:hello', { token: P.Chloé.token })).view;
  assert.equal(cView.players.find((p: Any) => p.id === P.Émile.id).revealedRoleId, 'villageois');

  // Vote : Chloé Cheffe (×2), Alice ciblée par le Corbeau (+2), Bruno (Bavard) redirige David
  // Minuteur de débat : réglé par le MJ, visible sur les téléphones, effacé à l'ouverture du vote.
  await ok(gm, 'gm:action', { type: 'debate', seconds: 120 });
  await ok(gm, 'gm:action', { type: 'debate', seconds: 30, extend: true });
  const deb = (await ok(P.Chloé.s, 'player:hello', { token: P.Chloé.token })).view.game.debate;
  assert.equal(deb.seconds, 150);
  assert.ok(deb.endsAt > Date.now() + 140_000);
  // Le spectateur (Émile, mort) voit aussi le débat mais aucun rôle caché.
  const spec = (await ok(P.Émile.s, 'player:hello', { token: P.Émile.token })).view;
  assert.equal(spec.game.debate.seconds, 150);
  assert.ok(spec.players.filter((p: Any) => p.id !== P.Émile.id).every((p: Any) => p.revealedRoleId === null));

  // Le Bavard voit son effet en attente ; personne d'autre ne le voit.
  const bDay = (await ok(P.Bruno.s, 'player:hello', { token: P.Bruno.token })).view;
  assert.equal(bDay.bavard.pending.voterName, 'David');
  const dDay = (await ok(P.David.s, 'player:hello', { token: P.David.token })).view;
  assert.equal(dDay.bavard, null);
  await ok(gm, 'gm:action', { type: 'setChief', playerId: P.Chloé.id });
  await ok(gm, 'gm:action', { type: 'openVote', kind: 'elimination' });
  await fail(P.Émile.s, 'player:ballot', { targetId: P.Alice.id }, /éliminés/);
  await fail(P.Alice.s, 'player:ballot', { targetId: P.Émile.id }, /désigné|éliminé/);
  await fail(P.Alice.s, 'player:ballot', { targetId: P.Alice.id }, /vous-même/);
  await ok(P.Alice.s, 'player:ballot', { targetId: P.Chloé.id });
  await fail(P.Alice.s, 'player:ballot', { targetId: P.David.id }, /déjà voté/);
  await ok(P.Bruno.s, 'player:ballot', { targetId: P.Chloé.id });
  await ok(P.Chloé.s, 'player:ballot', { targetId: P.Bruno.id });

  // Vote secret jusqu'à la clôture, y compris pour le MJ et les autres joueurs
  const during = (await ok(gm, 'gm:hello', { token: gmToken })).game;
  assert.equal(during.debate, null, 'le débat s’arrête quand le vote s’ouvre');
  assert.deepEqual(during.vote.ballots, {});
  assert.equal(during.voteProgress.voted.length, 3);
  // Alice perd le réseau pendant le vote : son bulletin est conservé.
  P.Alice.s.close();
  P.Alice.s = await connect();
  const aView = (await ok(P.Alice.s, 'player:hello', { token: P.Alice.token })).view;
  assert.equal(aView.vote.myBallot, P.Chloé.id);
  assert.ok(!JSON.stringify(aView).includes('ballots'));

  // Dernier bulletin : tous les vivants ont voté, le vote se clôt tout seul.
  await ok(P.David.s, 'player:ballot', { targetId: P.Alice.id });
  const res = (await ok(gm, 'gm:hello', { token: gmToken })).game.vote.result;
  const total = (id: string) => res.entries.find((e: Any) => e.playerId === id)?.total ?? 0;
  assert.equal(total(P.Chloé.id), 3); // Alice + Bruno + David redirigé
  assert.equal(total(P.Bruno.id), 2); // Cheffe ×2
  assert.equal(total(P.Alice.id), 2); // Corbeau +2 (vote de David redirigé)
  assert.deepEqual(res.leaders, [P.Chloé.id]);

  // Gagnant unique : élimination automatique, rôle dévoilé → fin de partie + archives
  // 2 loups contre 1 villageois, aucun mercenaire : la partie se termine d'elle-même.
  const ended = (await ok(P.David.s, 'player:hello', { token: P.David.token })).view;
  assert.equal(ended.game.winner, 'Les Loups-Garous');
  assert.equal(ended.players.find((p: Any) => p.id === P.Bruno.id).revealedRoleId, 'loupBavard');
  assert.equal(ended.players.find((p: Any) => p.id === P.Bruno.id).isWinner, true);
  assert.equal(ended.me.isWinner, false);

  // Un jeton = une seule session : la nouvelle connexion ferme l'ancienne
  const replaced = new Promise((r) => P.David.s.once('player:replaced', r));
  const other = await connect();
  await ok(other, 'player:hello', { token: P.David.token });
  await replaced;

  const auth = { Authorization: `Bearer ${gmToken}` };
  const list = await fetch(`${URL}/api/archives`, { headers: auth }).then((r) => r.json());
  assert.equal(list.length, 1);
  assert.equal(list[0].winner, 'Les Loups-Garous');
  const exp = await fetch(`${URL}/api/games/current/export`, { headers: auth }).then((r) => r.json());
  assert.ok(!JSON.stringify(exp).includes(P.Alice.token));
  const imp = await fetch(`${URL}/api/archives/import`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(exp) });
  assert.equal(imp.status, 200);
  assert.equal((await fetch(`${URL}/api/archives`, { headers: auth }).then((r) => r.json())).length, 2);
  assert.equal((await fetch(`${URL}/api/archives`)).status, 401);

  // Compositions enregistrées par le MJ
  const json = { ...auth, 'Content-Type': 'application/json' };
  const pr = await fetch(`${URL}/api/presets`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'Chaos', composition: { loup: 2, voyante: 3, inconnu: 1 } }) }).then((r) => r.json());
  assert.deepEqual(pr.composition, { loup: 2, voyante: 1 });
  assert.equal((await fetch(`${URL}/api/presets`, { method: 'POST', headers: json, body: JSON.stringify({ name: '', composition: { loup: 1 } }) })).status, 400);
  assert.equal((await fetch(`${URL}/api/presets`, { headers: auth }).then((r) => r.json())).length, 1);
  assert.equal((await fetch(`${URL}/api/presets`)).status, 401);
  assert.equal((await fetch(`${URL}/api/presets/${pr.id}`, { method: 'DELETE', headers: auth })).status, 200);

  // Nouvelle partie possible après la fin
  await ok(gm, 'gm:createGame', { expectedPlayers: 6 });
});
