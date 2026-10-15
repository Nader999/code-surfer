# Subway Player

Un lecteur vidéo qui tourne en boucle à côté de ton code, comme les vidéos « split screen » avec du gameplay Subway Surfers en bas de l'écran. Ça marche dans VS Code et dans Cursor.

![VS Code](https://img.shields.io/badge/VS%20Code-1.80%2B-007ACC) ![Cursor](https://img.shields.io/badge/Cursor-compatible-black) [![Dernière version](https://img.shields.io/github/v/release/Nader999/subway-player?label=t%C3%A9l%C3%A9charger)](https://github.com/Nader999/subway-player/releases/latest)

## Installation

L'extension n'est pas (encore) sur le marketplace : elle s'installe à partir d'un fichier `.vsix`, en moins d'une minute.

### 1. Télécharger

Va sur la page [**Releases**](https://github.com/Nader999/subway-player/releases/latest) et télécharge le fichier `subway-player-x.y.z.vsix` dans la section **Assets**.

### 2. Installer dans VS Code

1. Ouvre la vue **Extensions** (`Ctrl+Shift+X`, ou `Cmd+Shift+X` sur Mac).
2. Clique sur le menu **`…`** en haut de la vue, puis sur **Install from VSIX…**.
3. Choisis le fichier `.vsix` que tu viens de télécharger.

Ou en ligne de commande :

```bash
code --install-extension subway-player-x.y.z.vsix
```

### 2 bis. Installer dans Cursor

Même principe : vue **Extensions** (`Ctrl+Shift+X` / `Cmd+Shift+X`), menu **`…`**, puis **Install from VSIX…**. Tu peux aussi glisser-déposer le fichier `.vsix` dans la vue Extensions.

Ou en ligne de commande :

```bash
cursor --install-extension subway-player-x.y.z.vsix
```

### 3. Vérifier

Un bouton **▶ Subway** apparaît en bas à droite, dans la barre d'état. S'il n'apparaît pas, recharge la fenêtre (palette de commandes, puis **Developer: Reload Window**).

### Mettre à jour / désinstaller

- **Mettre à jour** : télécharge le nouveau `.vsix` depuis les Releases et installe-le de la même façon, il remplace l'ancien.
- **Désinstaller** : vue Extensions, clic droit sur **Subway Player**, puis **Uninstall**.

## Utilisation

1. Ouvre la palette de commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`) et lance **Subway Player: Choisir une catégorie…**
2. Choisis une catégorie, puis donne-lui une source : un fichier vidéo, un dossier (les vidéos s'enchaînent au hasard), ou un lien.
3. Le player s'ouvre à côté de l'éditeur, muet et en boucle.

| Raccourci | Action |
| --- | --- |
| `Ctrl+Alt+S` (`Cmd+Alt+S`) | Afficher / masquer le player |
| `Ctrl+Alt+N` (`Cmd+Alt+N`) | Passer à la catégorie suivante |

Dans le player, survole la vidéo pour faire apparaître le bouton de catégorie et le bouton 🔇 / 🔊. Double-clic pour passer à la vidéo suivante d'un dossier.

Astuce : glisse l'onglet du player en bas de l'éditeur pour un vrai split screen vertical.

## Catégories

Catégories proposées par défaut, toutes du même genre que Subway Surfers (un mouvement continu qui occupe l'œil sans demander d'attention) :

- Subway Surfers
- Parkour Minecraft
- Méga rampes GTA
- Sable cinétique ASMR
- Slime et savon satisfaisants
- Presse hydraulique
- Geometry Dash
- Trackmania
- Stream Twitch

Tu peux en ajouter avec **Nouvelle catégorie…** dans le sélecteur, ou directement dans `settings.json` :

```json
"subwayPlayer.categories": {
  "Subway Surfers": "~/Videos/subway",
  "Parkour Minecraft": "~/Videos/minecraft-parkour.webm",
  "Stream Twitch": "https://twitch.tv/zerator",
  "Ma catégorie": "https://exemple.com/video.mp4"
}
```

## Streams Twitch

Lance **Subway Player: Regarder un stream Twitch…** et colle le lien de la chaîne (ou juste son nom). Un lien Twitch marche aussi comme source de n'importe quelle catégorie.

Le stream est affiché en entier (sans recadrage) et démarre muet comme le reste : clique sur 🔇 pour avoir le son. Si la chaîne n'est pas en live, le player le dit et propose de réessayer.

Le lecteur intégrable officiel de Twitch refuse de s'afficher dans un éditeur, donc l'extension lit le flux vidéo du live directement, comme le font streamlink ou VLC. Ça passe par l'API non documentée du site twitch.tv : si Twitch la change, cette partie peut cesser de marcher jusqu'à une mise à jour.

## Réglages

| Réglage | Défaut | Rôle |
| --- | --- | --- |
| `subwayPlayer.categories` | voir plus haut | Nom de catégorie → fichier, dossier, URL directe, lien YouTube ou Twitch |
| `subwayPlayer.activeCategory` | `Subway Surfers` | Catégorie affichée |
| `subwayPlayer.muted` | `true` | Lecture sans le son |
| `subwayPlayer.playbackRate` | `1` | Vitesse de lecture (ignorée pour les lives) |
| `subwayPlayer.showControls` | `false` | Contrôles natifs du lecteur |
| `subwayPlayer.openOnStartup` | `false` | Ouvrir le player au lancement |
| `subwayPlayer.showStatusBarButton` | `true` | Bouton dans la barre d'état |

Les chemins peuvent être absolus, commencer par `~`, ou être relatifs au dossier du workspace. L'ancien réglage `subwayPlayer.videoSource` de la v0.1 est déplacé automatiquement dans la catégorie Subway Surfers.

## Où trouver une vidéo

L'extension n'embarque aucune vidéo (les jeux et les vidéos appartiennent à leurs auteurs). Télécharge ou enregistre des vidéos que tu as le droit d'utiliser et range-les par dossier, un par catégorie.

Formats : le `.webm` (VP9) et le `.mp4` (H.264) sont les plus sûrs. Les liens YouTube sont pris en charge, mais certaines vidéos refusent l'intégration dans l'éditeur : un fichier local reste la solution la plus fiable.

## Développement

Prérequis : Node.js 18 ou plus.

```bash
git clone https://github.com/Nader999/subway-player.git
cd subway-player
npm install
npm run compile      # ou npm run watch
npm run package      # produit subway-player-<version>.vsix
```

Pour tester sans installer : ouvre le dossier dans VS Code ou Cursor et lance **Run Extension** (`F5`). Une nouvelle fenêtre s'ouvre avec l'extension chargée.

### Publier une nouvelle version

1. Augmente `version` dans `package.json` et note les changements dans `CHANGELOG.md`.
2. Crée un tag et pousse-le :

```bash
git tag v0.3.0
git push origin v0.3.0
```

GitHub Actions compile l'extension et publie automatiquement une Release avec le `.vsix` en pièce jointe.

## Licence

MIT
