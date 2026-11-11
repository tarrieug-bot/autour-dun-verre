# Autour d'un Verre — atelier dégustation en direct

Application web temps réel (Node.js + Express + Socket.io, état en mémoire).

- **Invités** : `https://<ton-adresse>/` → pseudo + un mot, et c'est parti. Aucun compte.
- **Animateur** : `https://<ton-adresse>/host` → mot de passe défini dans `HOST_PASSWORD`.

## Mise en ligne (Render, gratuit)

1. Mettre ce dossier dans un dépôt GitHub.
2. Sur render.com → **New → Blueprint** → choisir le dépôt (le fichier `render.yaml` configure tout).
3. Renseigner `HOST_PASSWORD` quand Render le demande.
4. L'adresse finale ressemble à `https://autour-dun-verre.onrender.com`.

⚠️ Offre gratuite Render : le serveur s'endort après ~15 min sans visite et met ~30-50 s à se réveiller.
Le jour J, **ouvre la console `/host` 5 minutes avant** et laisse-la ouverte : elle garde le serveur éveillé.
Un redémarrage du serveur efface la partie en cours (pas de base de données, c'est voulu).

## En local

```bash
npm install
HOST_PASSWORD=monmotdepasse npm start   # http://localhost:3000 et /host
```

## Répéter seul (mode démo)

Dans la console `/host`, panneau « Mode démo » :
- **+ 6 fictifs** ajoute des invités fictifs ;
- **Faire jouer** les fait répondre à l'étape en cours (une affirmation à la fois pour le Body Count) ;
- **Ouvrir un invité test** ouvre un onglet avec une identité invité séparée (`/?slot=…`) — tu peux en ouvrir plusieurs ;
- **Nouvelle session** (deux clics) remet tout à zéro avant la vraie soirée.

## Déroulé

Accueil (QR code affiché sur la console) → Body Count (10 affirmations, lecteur tournant) → Classement + 3 équipes →
Bouteille 1 « Le Mot Interdit » → Bouteille 2 « Le Match » → « Le Juste Prix » (rejouable par bouteille) →
Mur de mots → Fiches récap personnelles.

La liste nominative des votes du Match n'est envoyée qu'aux connexions animateur authentifiées ;
les invités ne reçoivent que les pourcentages.
