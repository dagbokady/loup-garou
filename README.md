# 🐺 Loup-Garou — Le Village de Thiercelune

Application web temps réel pour organiser des parties de Loup-Garou : un **Maître du jeu** (compte personnel) pilote la partie, les **joueurs** rejoignent depuis leur téléphone avec un simple code, sans compte.

- Frontend : React + TypeScript + Tailwind CSS (Vite)
- Backend : Node.js + Express + Socket.IO
- **Aucune base de données** : parties actives en mémoire, comptes MJ et archives dans des fichiers JSON.

## Démarrage

```bash
npm install
```

```bash
npm run dev
```

- Interface : http://localhost:5173 (le serveur API tourne sur le port 3001).
- **Téléphones** : ouvrez l'adresse « Network » affichée par Vite (ex. `http://192.168.x.x:5173`). Les appareils doivent être sur le même réseau Wi-Fi.

Production (un seul port, client compilé servi par Node) :

```bash
npm run build
```

```bash
PORT=3001 npm start
```

Tests (règles de nuit + scénario complet MJ + 5 joueurs en Socket.IO) :

```bash
npm test
```

Il n'existe aucun compte par défaut : créez le vôtre depuis « Espace du Maître du jeu ». Variables d'environnement : voir `.env.example` (`GM_INVITE_CODE` pour restreindre la création de comptes).

## Parcours

**Maître du jeu** → se connecter → créer une partie (une seule active à la fois) → partager le code / QR code → proposition automatique de composition (modifiable) → distribution aléatoire ou manuelle → lancer.

Pendant la partie, la table du MJ regroupe :

| Élément | Rôle |
|---|---|
| 🔔 La Cloche du village | Tombée de la nuit / lever du jour, fin de partie |
| 🗺️ La Carte du village | Joueurs, rôles, statuts (Chef, amoureux, enchanté, protégé…) ; clic = éliminer, ramener, nommer Chef, murmure privé, lien de reprise |
| 💀 Le Registre des âmes | Vivants et éliminés |
| 🪶 Le Pupitre du narrateur | Nuit : réveils dans l'ordre voulu, enregistrement des choix, récapitulatif, validation. Jour : votes, annonces |
| 📜 Le Livre des événements | Historique public et secret |
| 📖 Le Grimoire | Règles et fiches de tous les rôles |

**Joueur** → code + pseudonyme → carte secrète (toucher pour révéler) → votes, murmures du narrateur, chat de la meute la nuit (loups et Chien-Loup rallié uniquement), pouvoir du Loup Bavard depuis son appareil.

## Principes de jeu

- **L'application ne décide jamais** : elle enregistre les choix, vérifie les règles (potions déjà utilisées, Salvateur deux nuits de suite, Loup Blanc nuits 3/5/7, Renard sans flair…), **propose** des conséquences et le MJ coche ce qui s'applique. Chasseur et mort de chagrin génèrent des déclencheurs à confirmer.
- **Votes** : 1 voix par joueur, Chef ×2, cible du Corbeau +2, Loup Bavard (annuler / rediriger, jamais le Chef). Secret jusqu'à la clôture, **y compris pour le MJ** (il voit seulement qui a voté). Le MJ annonce le résultat et peut publier les totaux.
- **Fin de partie** : le MJ proclame le vainqueur (des indices sont affichés), tous les rôles sont révélés, la partie est archivée.

## Sécurité et confidentialité

- Chaque client reçoit une **vue filtrée** construite côté serveur (`server/src/game/views.ts`) : un joueur ne reçoit jamais le rôle, les murmures ou le bulletin d'un autre.
- Jetons de reconnexion joueur : 256 bits aléatoires (`crypto.randomBytes`), conservés dans le navigateur (localStorage + sessionStorage par onglet).
- Mots de passe MJ hachés avec **scrypt** + sel ; sessions MJ signées HMAC-SHA256 (7 jours) ; limitation des tentatives de connexion.
- Toutes les actions sont vérifiées côté serveur : un éliminé ne peut plus voter ni discuter, un joueur ne peut pas modifier son rôle ni appeler les actions du MJ.

## Données et limites (sans base de données)

`server/data/` (ignoré par git) contient :
- `accounts.json` — comptes MJ (hachés) ;
- `archives/<id-mj>.json` — parties terminées (export / import JSON depuis la page Archives) ;
- `active-games.json` — instantané des parties en cours, rechargé au redémarrage (moins de 48 h). Désactivable avec `PERSIST_ACTIVE=0` : les parties actives sont alors perdues au redémarrage.

Le jeton d'un joueur n'existe que sur son navigateur : s'il change d'appareil, le MJ peut lui transmettre un **lien de reprise** depuis la Carte du village.

## Structure

```
shared/          types communs + Grimoire (fiches des rôles, proposition de composition)
server/src/
  accounts.ts    comptes MJ, hachage, jetons signés
  archives.ts    historique JSON, import
  game/engine.ts moteur de règles (nuits, conséquences, votes, fin)
  game/views.ts  vues filtrées MJ / joueur (confidentialité)
  socket.ts      événements temps réel + contrôles d'accès
  index.ts       API HTTP + fichiers statiques
client/src/
  pages/Home.tsx, pages/gm/*, pages/player/*
  components/    fond jour/nuit, cartes, Grimoire, modales
client/public/assets/   illustrations (rôles, dos de carte, fonds, grimoire)
originals/              images sources en pleine résolution
```

Ajouter un rôle : une fiche dans `shared/roles.ts`, éventuellement une action dans `NIGHT_ACTIONS` et sa logique dans `recordAction` / `proposeConsequences` (`engine.ts`).

## À enrichir

- Illustration dédiée au **Simple Villageois** (une carte composée à partir du dos de carte est utilisée en attendant : déposer `client/public/assets/roles/villageois.jpg` et renseigner `image` dans `shared/roles.ts`).
- Sons d'ambiance, animations de transition jour/nuit plus poussées.
