/** Tests unitaires des règles (le moteur propose, le MJ valide). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/game/engine.ts';
import type { RoleId } from '../../shared/types.ts';

/** Crée une partie lancée, en nuit 1 (nuit de préparation). */
function setup(roles: RoleId[]) {
  const g = E.createGame('gm', 'MJ', 'ABCDEF', roles.length);
  const comp: Partial<Record<RoleId, number>> = {};
  roles.forEach((r) => (comp[r] = (comp[r] ?? 0) + 1));
  E.setComposition(g, comp);
  const ps = roles.map((_, i) => E.addPlayer(g, `J${i}`));
  ps.forEach((p, i) => E.assignRole(g, p.id, roles[i]));
  E.startGame(g);
  E.closeReveal(g);
  return { g, ps };
}
const validateAll = (g: E.Game) =>
  E.validateNight(g, E.proposeConsequences(g).filter((c) => c.checked && !c.informative).map((c) => c.id));
/** Valide la nuit 1 et passe directement à la nuit 2. */
const toNight2 = (g: E.Game) => { validateAll(g); E.startNight(g); };
const nextNight = (g: E.Game) => { validateAll(g); E.startDay(g); E.startNight(g); };
const keys = (g: E.Game) => E.availableNightActions(g).map((a) => a.key);

test('Nuit 1 = nuit de préparation : seuls Cupidon, Chien-Loup et Ange Déchu', () => {
  const { g } = setup(['loup', 'cupidon', 'chienLoup', 'angeDechu', 'voyante', 'sorciere']);
  assert.deepEqual(keys(g).sort(), ['angeDechu', 'chienLoup', 'cupidon']);
  assert.throws(() => E.recordAction(g, 'loups', { targets: [g.players[4].id] }), /pas disponible/);
  toNight2(g);
  assert.ok(keys(g).includes('loups') && keys(g).includes('voyante'));
  assert.ok(!keys(g).includes('cupidon'));
});

test('Cupidon peut se désigner lui-même ; les amoureux sont informés', () => {
  const { g, ps } = setup(['loup', 'cupidon', 'villageois', 'villageois']);
  E.recordAction(g, 'cupidon', { targets: [ps[1].id, ps[2].id] });
  const w = E.proposeConsequences(g).filter((c) => c.kind === 'whisper');
  assert.equal(w.length, 2);
  validateAll(g);
  assert.match(ps[1].whispers[0].text, /J2/);
});

test('Salvateur : pas deux nuits de suite le même joueur, protège des loups et du Loup Blanc', () => {
  const { g, ps } = setup(['loup', 'salvateur', 'villageois', 'villageois']);
  toNight2(g);
  E.recordAction(g, 'salvateur', { targets: [ps[2].id] });
  E.recordAction(g, 'loups', { targets: [ps[2].id] });
  assert.ok(!E.proposeConsequences(g).some((c) => c.kind === 'death'));
  validateAll(g);
  assert.ok(ps[2].alive);
  E.startDay(g); E.startNight(g);
  assert.throws(() => E.recordAction(g, 'salvateur', { targets: [ps[2].id] }), /consécutives/);
  E.recordAction(g, 'salvateur', { targets: [ps[1].id] }); // lui-même : autorisé
});

test('Salvateur ne bloque pas la transformation du Loup Noir', () => {
  const { g, ps } = setup(['loup', 'loupNoir', 'salvateur', 'voyante', 'villageois']);
  toNight2(g); nextNight(g); // nuit 3 : le Loup Noir ne chasse pas en nuit 2
  E.recordAction(g, 'salvateur', { targets: [ps[3].id] });
  E.recordAction(g, 'loups', { targets: [ps[3].id] });
  E.recordAction(g, 'loupNoir', { choice: 'transformer' });
  validateAll(g);
  assert.ok(ps[3].alive);
  assert.equal(ps[3].roleId, 'loup');
  assert.equal(ps[3].originalRoleId, 'voyante');
  assert.ok(E.isPackMember(g, ps[3]));
  E.startDay(g);
  // Annonce publique anonyme, sans l'ancien rôle
  const pub = g.events.filter((e) => e.visibility === 'public').map((e) => e.text).join(' ');
  assert.match(pub, /rejoint les Loups-Garous/);
  assert.ok(!pub.includes('J3') && !pub.includes('Voyante'));
  E.startNight(g);
  assert.ok(!keys(g).includes('loupNoir') || E.availableNightActions(g).find((a) => a.key === 'loupNoir')?.reason);
});

test('Ancien : survit à la 1re attaque réussie, meurt à la 2e', () => {
  const { g, ps } = setup(['loup', 'ancien', 'villageois', 'villageois']);
  toNight2(g);
  E.recordAction(g, 'loups', { targets: [ps[1].id] });
  validateAll(g);
  assert.ok(ps[1].alive);
  E.startDay(g); E.startNight(g);
  E.recordAction(g, 'loups', { targets: [ps[1].id] });
  validateAll(g);
  assert.equal(ps[1].alive, false);
});

test('Sorcière : potion consommée seulement si elle sauve une vraie victime', () => {
  const { g, ps } = setup(['loup', 'sorciere', 'salvateur', 'villageois', 'villageois']);
  toNight2(g);
  E.recordAction(g, 'salvateur', { targets: [ps[3].id] });
  E.recordAction(g, 'loups', { targets: [ps[3].id] });
  E.recordAction(g, 'sorciere', { heal: ps[3].id });
  validateAll(g);
  assert.equal(g.powers.witchHealUsed, false, 'victime déjà protégée : potion non consommée');
  E.startDay(g); E.startNight(g);
  E.recordAction(g, 'loups', { targets: [ps[1].id] });
  assert.deepEqual(E.nightVictims(g), [ps[1].id]);
  E.recordAction(g, 'sorciere', { heal: ps[1].id, poison: ps[4].id }); // sur elle-même + poison la même nuit
  validateAll(g);
  assert.ok(ps[1].alive);
  assert.equal(ps[4].alive, false);
  assert.ok(g.powers.witchHealUsed && g.powers.witchPoisonUsed);
});

test('Sorcière peut sauver la victime du Loup Blanc', () => {
  const { g, ps } = setup(['loup', 'loupBlanc', 'sorciere', 'villageois', 'villageois', 'villageois']);
  toNight2(g); nextNight(g); // nuit 3
  E.recordAction(g, 'loups', { targets: [ps[3].id] });
  E.recordAction(g, 'loupBlanc', { targets: [ps[0].id] }); // peut viser un loup
  assert.deepEqual(E.nightVictims(g).sort(), [ps[0].id, ps[3].id].sort());
  E.recordAction(g, 'sorciere', { heal: ps[0].id });
  validateAll(g);
  assert.ok(ps[0].alive);
  assert.equal(ps[3].alive, false);
});

test('Loup Blanc : nuits 3, 5, 7… uniquement', () => {
  const { g } = setup(['loup', 'loupBlanc', 'villageois', 'villageois', 'villageois', 'villageois']);
  const has = () => keys(g).includes('loupBlanc');
  toNight2(g);
  assert.equal(has(), false);
  nextNight(g); assert.equal(has(), true); // 3
  nextNight(g); assert.equal(has(), false); // 4
  nextNight(g); assert.equal(has(), true); // 5
});

test('Amoureux : la mort de l’un entraîne celle de l’autre, quelle que soit la cause', () => {
  const { g, ps } = setup(['loup', 'cupidon', 'villageois', 'villageois', 'villageois']);
  E.recordAction(g, 'cupidon', { targets: [ps[2].id, ps[3].id] });
  toNight2(g);
  E.recordAction(g, 'loups', { targets: [ps[2].id] });
  assert.ok(E.proposeConsequences(g).some((c) => c.kind === 'death' && c.playerId === ps[3].id));
  validateAll(g);
  assert.equal(ps[3].alive, false);
});

test('Amoureux éliminé par le vote : l’autre meurt aussitôt, carte dévoilée', () => {
  const { g, ps } = setup(['loup', 'cupidon', 'villageois', 'villageois', 'villageois']);
  E.recordAction(g, 'cupidon', { targets: [ps[2].id, ps[3].id] });
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[2].id, 'vote');
  assert.equal(ps[3].alive, false);
  assert.equal(ps[3].revealed, true);
  assert.match(ps[3].deathReason!, /lié\(e\) par Cupidon/);
  assert.equal(g.pendingTriggers.length, 0);
});

test('Chasseur : déclencheur à sa mort', () => {
  const { g, ps } = setup(['loup', 'chasseur', 'villageois', 'villageois']);
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[1].id, 'vote');
  assert.equal(g.pendingTriggers[0].type, 'hunter');
  E.resolveTrigger(g, g.pendingTriggers[0].id, ps[0].id);
  assert.equal(ps[0].alive, false);
});

test('Chef éliminé : succession proposée au MJ', () => {
  const { g, ps } = setup(['loup', 'villageois', 'villageois', 'villageois']);
  validateAll(g); E.startDay(g);
  E.setChief(g, ps[1].id);
  E.eliminate(g, ps[1].id, 'vote');
  assert.equal(g.chiefId, null);
  assert.equal(g.pendingTriggers[0].type, 'chief');
  E.resolveTrigger(g, g.pendingTriggers[0].id, ps[2].id);
  assert.equal(g.chiefId, ps[2].id);
});

test('Renard : perd son pouvoir si aucun loup', () => {
  const { g, ps } = setup(['renard', 'villageois', 'villageois', 'villageois', 'villageois', 'loup']);
  toNight2(g);
  E.recordAction(g, 'renard', { targets: [ps[2].id] }); // voisins 1,2,3 : pas de loup
  validateAll(g);
  assert.equal(g.powers.renardLost, true);
  E.startDay(g); E.startNight(g);
  assert.throws(() => E.recordAction(g, 'renard', { targets: [ps[0].id] }), /perdu/);
});

test('Chien-Loup : choix définitif, rejoint la meute', () => {
  const { g, ps } = setup(['loup', 'chienLoup', 'villageois', 'villageois']);
  assert.equal(E.isPackMember(g, ps[1]), false);
  E.recordAction(g, 'chienLoup', { choice: 'loups' });
  validateAll(g);
  assert.equal(E.isPackMember(g, ps[1]), true);
});

test('Joueur de Flûte : nombre limité, pas lui-même', () => {
  const { g, ps } = setup(['joueurDeFlute', 'loup', 'villageois', 'villageois', 'villageois']);
  toNight2(g);
  assert.throws(() => E.recordAction(g, 'joueurDeFlute', { targets: [ps[1].id, ps[2].id, ps[3].id] }), /1 à 2/);
  assert.throws(() => E.recordAction(g, 'joueurDeFlute', { targets: [ps[0].id] }), /lui-même/);
  E.recordAction(g, 'joueurDeFlute', { targets: [ps[1].id, ps[2].id] });
  validateAll(g);
  assert.ok(ps[1].charmed && ps[2].charmed);
});

test('Joueur de Flûte : victoire automatique dès que tous les vivants sont ensorcelés', () => {
  const { g, ps } = setup(['joueurDeFlute', 'loup', 'villageois', 'villageois']);
  toNight2(g);
  E.recordAction(g, 'joueurDeFlute', { targets: [ps[1].id, ps[2].id] });
  validateAll(g);
  assert.equal(E.autoVictory(g), false, 'il reste un joueur à ensorceler');
  ps[3].charmed = true;
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'Le Joueur de Flûte');
  assert.deepEqual(g.winnerIds, [ps[0].id]);
});

test('Vote : pas contre soi-même, un seul bulletin par tour', () => {
  const { g, ps } = setup(['loup', 'villageois', 'villageois', 'villageois']);
  validateAll(g); E.startDay(g);
  E.openVote(g, { kind: 'elimination' });
  assert.throws(() => E.castBallot(g, ps[1].id, ps[1].id), /vous-même/);
  E.castBallot(g, ps[1].id, ps[0].id);
  assert.throws(() => E.castBallot(g, ps[1].id, ps[2].id), /déjà voté/);
});

test('Ange Déchu : victoire s’il est éliminé au premier vote', () => {
  const { g, ps } = setup(['loup', 'angeDechu', 'villageois', 'villageois']);
  E.recordAction(g, 'angeDechu', { choice: 'elimination' });
  validateAll(g); E.startDay(g);
  E.openVote(g, { kind: 'elimination' });
  E.castBallot(g, ps[2].id, ps[1].id);
  E.closeVote(g);
  E.eliminate(g, ps[1].id, 'vote', true, 'vote');
  assert.equal(E.victoryChecks(g).find((c) => c.id === 'ange')?.met, true);
});

test('Conditions de victoire et gagnants', () => {
  const { g, ps } = setup(['loup', 'villageois', 'villageois']);
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[0].id, 'vote');
  assert.equal(E.victoryChecks(g).find((c) => c.id === 'village')?.met, true);
  E.endGame(g, 'Le Village', false, E.winnersFor(g, ['village']));
  assert.deepEqual(g.winnerIds.sort(), [ps[1].id, ps[2].id].sort());
});

test('Lancement refusé si composition ≠ joueurs', () => {
  const g = E.createGame('gm', 'MJ', 'ABCDEF', 4);
  E.setComposition(g, { loup: 1, villageois: 2 });
  for (let i = 0; i < 4; i++) E.addPlayer(g, `J${i}`);
  assert.throws(() => E.distributeRandom(g), /3 rôle/);
});

test('Fin de partie automatique', () => {
  // 3 loups contre 2 villageois : victoire des loups
  let { g, ps } = setup(['loup', 'loup', 'loup', 'villageois', 'villageois', 'villageois']);
  validateAll(g); E.startDay(g);
  assert.equal(E.autoVictory(g), false); // 3 contre 3
  E.eliminate(g, ps[5].id, 'vote', true);
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'Les Loups-Garous');
  assert.deepEqual(g.winnerIds.sort(), [ps[0].id, ps[1].id, ps[2].id].sort());

  // Tous les loups morts : victoire du village
  ({ g, ps } = setup(['loup', 'villageois', 'villageois']));
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[0].id, 'vote', true);
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'Les Villageois');

  // Un mercenaire en vie : la partie continue
  ({ g, ps } = setup(['loup', 'loup', 'villageois', 'joueurDeFlute']));
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[2].id, 'vote', true);
  assert.equal(E.autoVictory(g), false);
  E.eliminate(g, ps[3].id, 'vote', true);
  assert.equal(E.autoVictory(g), true);
});

test('Fins automatiques : Loup Blanc, amoureux, Ange Déchu', () => {
  // Loup Blanc dernier survivant
  let { g, ps } = setup(['loupBlanc', 'loup', 'villageois']);
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[2].id, 'vote', true);
  assert.equal(E.autoVictory(g), false, 'le Loup Blanc doit encore éliminer le loup');
  E.eliminate(g, ps[1].id, 'test', true);
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'Le Loup Blanc');
  assert.deepEqual(g.winnerIds, [ps[0].id]);

  // Couple mixte seul survivant
  ({ g, ps } = setup(['cupidon', 'loup', 'villageois', 'villageois']));
  E.recordAction(g, 'cupidon', { targets: [ps[1].id, ps[2].id] });
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[3].id, 'vote', true);
  assert.equal(E.autoVictory(g), false);
  E.eliminate(g, ps[0].id, 'test', true);
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'Les Amoureux');
  assert.deepEqual(g.winnerIds.sort(), [ps[1].id, ps[2].id].sort());

  // Ange Déchu éliminé au premier vote : la partie s'arrête, il gagne seul
  ({ g, ps } = setup(['loup', 'angeDechu', 'villageois', 'villageois']));
  E.recordAction(g, 'angeDechu', { choice: 'elimination' });
  validateAll(g); E.startDay(g);
  E.openVote(g, { kind: 'elimination' });
  E.castBallot(g, ps[2].id, ps[1].id);
  E.closeVote(g);
  E.eliminate(g, ps[1].id, 'vote', true, 'vote');
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'L’Ange Déchu');

  // Ange Déchu « survie » en vie à la fin : il gagne avec le camp victorieux
  ({ g, ps } = setup(['loup', 'angeDechu', 'villageois', 'villageois']));
  E.recordAction(g, 'angeDechu', { choice: 'survie' });
  validateAll(g); E.startDay(g);
  E.eliminate(g, ps[0].id, 'vote', true);
  assert.equal(E.autoVictory(g), true);
  assert.equal(g.winner, 'Les Villageois');
  assert.ok(g.winnerIds.includes(ps[1].id));
});

test('Fille de joie : neutralise son hôte sans qu’il le sache, jamais deux nuits de suite chez le même', () => {
  const { g, ps } = setup(['loup', 'filleDeJoie', 'voyante', 'salvateur', 'villageois']);
  toNight2(g);
  assert.equal(keys(g)[0], 'filleDeJoie');
  assert.throws(() => E.recordAction(g, 'filleDeJoie', { targets: [ps[1].id] }), /quelqu’un d’autre/);
  E.recordAction(g, 'filleDeJoie', { targets: [ps[3].id] }); // chez le Salvateur
  E.recordAction(g, 'salvateur', { targets: [ps[4].id] }); // enregistré… mais sans effet
  E.recordAction(g, 'loups', { targets: [ps[4].id] });
  assert.ok(E.proposeConsequences(g).some((c) => c.id === `death:${ps[4].id}:loups`));
  validateAll(g);
  assert.ok(!ps[4].alive);
  E.startDay(g); E.startNight(g);
  assert.throws(() => E.recordAction(g, 'filleDeJoie', { targets: [ps[3].id] }), /deux nuits de suite/);
});

test('Fille de joie : la Voyante séduite n’obtient aucune vision', () => {
  const { g, ps } = setup(['loup', 'filleDeJoie', 'voyante', 'villageois']);
  toNight2(g);
  E.recordAction(g, 'filleDeJoie', { targets: [ps[2].id] });
  E.recordAction(g, 'voyante', { targets: [ps[0].id] });
  assert.equal((g.powers.seerVisions ?? []).length, 0);
});

test('Fille de joie : attaquée chez elle alors qu’elle dort ailleurs, elle survit', () => {
  const { g, ps } = setup(['loup', 'filleDeJoie', 'villageois', 'villageois']);
  toNight2(g);
  E.recordAction(g, 'filleDeJoie', { targets: [ps[2].id] });
  E.recordAction(g, 'loups', { targets: [ps[1].id] });
  assert.ok(!E.proposeConsequences(g).some((c) => c.kind === 'death'));
  validateAll(g);
  assert.ok(ps[1].alive);
});

test('Fille de joie : si son hôte est dévoré, elle meurt avec lui (même chez un loup)', () => {
  const { g, ps } = setup(['loup', 'filleDeJoie', 'villageois', 'villageois', 'loup']);
  toNight2(g);
  E.recordAction(g, 'filleDeJoie', { targets: [ps[2].id] });
  E.recordAction(g, 'loups', { targets: [ps[2].id] });
  validateAll(g);
  assert.ok(!ps[2].alive && !ps[1].alive);
  E.startDay(g); E.startNight(g);
  // Chez un loup : autorisé.
  const { g: g2, ps: q } = setup(['loup', 'filleDeJoie', 'villageois', 'villageois', 'loup']);
  toNight2(g2);
  E.recordAction(g2, 'filleDeJoie', { targets: [q[0].id] });
  E.recordAction(g2, 'loups', { targets: [q[3].id] }); // l'autre loup mène l'attaque
  validateAll(g2);
  assert.ok(!q[3].alive && q[1].alive);
});

test('Revanche : mêmes joueurs, mêmes jetons et même code, partie remise à zéro', () => {
  const { g, ps } = setup(['loup', 'voyante', 'villageois', 'villageois']);
  const tokens = ps.map((p) => p.token);
  const oldId = g.id;
  assert.throws(() => E.rematch(g), /pas terminée/);
  E.endGame(g, 'Village');
  E.rematch(g);
  assert.notEqual(g.id, oldId);
  assert.equal(g.code, 'ABCDEF');
  assert.equal(g.status, 'lobby');
  assert.deepEqual(g.players.map((p) => p.token), tokens);
  assert.ok(g.players.every((p) => p.alive && p.roleId === null && !p.revealed));
  assert.equal(g.composition.loup, 1);
  assert.equal(g.nightNumber, 0);
});

test('Révélation : pas de nuit tant que le MJ ne l’a pas close', () => {
  const g = E.createGame('gm', 'MJ', 'ABCDEF', 3);
  E.setComposition(g, { loup: 1, voyante: 1, villageois: 1 });
  const ps = ['A', 'B', 'C'].map((n) => E.addPlayer(g, n));
  (['loup', 'voyante', 'villageois'] as RoleId[]).forEach((r, i) => E.assignRole(g, ps[i].id, r));
  E.startGame(g);
  assert.equal(g.revealing, true);
  assert.throws(() => E.wake(g, 'cupidon'), /révélation/);
  E.markCardSeen(g, ps[0].id);
  E.markCardSeen(g, ps[0].id);
  assert.deepEqual(g.sawCard, [ps[0].id]);
  E.closeReveal(g);
  assert.equal(g.revealing, false);
  assert.throws(() => E.closeReveal(g), /déjà close/);
  E.markCardSeen(g, ps[1].id); // ignoré après la révélation
  assert.equal(g.sawCard!.length, 1);
});

test('Chef éliminé : il désigne lui-même son successeur', () => {
  const { g, ps } = setup(['loup', 'villageois', 'villageois', 'villageois']);
  validateAll(g); E.startDay(g);
  E.setChief(g, ps[1].id);
  E.eliminate(g, ps[1].id, 'vote');
  assert.throws(() => E.chiefSuccession(g, ps[2].id, ps[3].id));
  assert.throws(() => E.chiefSuccession(g, ps[1].id, ps[1].id));
  E.chiefSuccession(g, ps[1].id, ps[3].id);
  assert.equal(g.chiefId, ps[3].id);
  assert.equal(g.pendingTriggers.length, 0);
});
