# Subway Player

Un lecteur vidéo qui tourne en boucle à côté de ton code, comme les vidéos « split screen » avec du gameplay Subway Surfers en bas de l'écran. Ça marche dans VS Code et dans Cursor.

## Utilisation

1. Ouvre la palette de commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`) et lance **Subway Player: Choisir une vidéo…**
2. Choisis un fichier vidéo, ou un dossier entier pour enchaîner plusieurs vidéos au hasard.
3. Le player s'ouvre à côté de l'éditeur, muet et en boucle.

Pour l'afficher ou le masquer : `Ctrl+Alt+S` (`Cmd+Alt+S` sur Mac), le bouton **▶ Subway** dans la barre d'état, ou la commande **Subway Player: Afficher / masquer le player**. Double-clic sur la vidéo pour passer à la suivante.

Astuce : glisse l'onglet du player en bas de l'éditeur pour un vrai split screen vertical.

## Réglages

| Réglage | Défaut | Rôle |
| --- | --- | --- |
| `subwayPlayer.videoSource` | vide | Fichier local, dossier, URL directe (`.mp4`, `.webm`) ou lien YouTube |
| `subwayPlayer.muted` | `true` | Lecture sans le son |
| `subwayPlayer.playbackRate` | `1` | Vitesse de lecture |
| `subwayPlayer.showControls` | `false` | Contrôles natifs du lecteur |
| `subwayPlayer.openOnStartup` | `false` | Ouvrir le player au lancement |
| `subwayPlayer.showStatusBarButton` | `true` | Bouton dans la barre d'état |

Les chemins peuvent être absolus, commencer par `~`, ou être relatifs au dossier du workspace.

## Où trouver une vidéo

L'extension n'embarque aucune vidéo (le gameplay Subway Surfers appartient à SYBO). Télécharge ou enregistre une vidéo de gameplay que tu as le droit d'utiliser et pointe le réglage dessus.

Formats : le `.webm` (VP9) et le `.mp4` (H.264) sont les plus sûrs. Les liens YouTube sont pris en charge, mais certaines vidéos refusent l'intégration dans l'éditeur : un fichier local reste la solution la plus fiable.

## Développement

```bash
npm install
npm run compile      # ou npm run watch
npm run package      # produit subway-player-<version>.vsix
```

Pour tester : ouvre le dossier dans VS Code et lance **Run Extension** (F5).

Pour installer le `.vsix` : `code --install-extension subway-player-0.1.0.vsix`, ou `cursor --install-extension ...`, ou depuis la vue Extensions, menu `…` puis **Install from VSIX…**.
