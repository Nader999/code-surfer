import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getTwitchStreamUrl, parseTwitchChannel, TwitchError } from './twitch';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];
const YOUTUBE_PATTERN = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
const TWITCH_CATEGORY = 'Stream Twitch';

type VideoSource =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'files'; uris: vscode.Uri[]; roots: vscode.Uri[] }
  | { kind: 'url'; url: string }
  | { kind: 'youtube'; id: string }
  | { kind: 'twitch'; login: string };

type WebviewSource =
  | Exclude<VideoSource, { kind: 'files' } | { kind: 'twitch' }>
  | { kind: 'files'; urls: string[] }
  | { kind: 'twitch'; login: string; url: string }
  | { kind: 'twitch-error'; login: string; message: string; offline: boolean };

let panel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;
let renderId = 0;

export async function activate(context: vscode.ExtensionContext) {
  await migrateLegacyVideoSource();

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'subwayPlayer.toggle';
  updateStatusBar();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('subwayPlayer.open', () => openPlayer(context)),
    vscode.commands.registerCommand('subwayPlayer.close', () => panel?.dispose()),
    vscode.commands.registerCommand('subwayPlayer.toggle', () => (panel ? panel.dispose() : openPlayer(context))),
    vscode.commands.registerCommand('subwayPlayer.chooseCategory', () => chooseCategory(context)),
    vscode.commands.registerCommand('subwayPlayer.nextCategory', () => cycleCategory(context)),
    vscode.commands.registerCommand('subwayPlayer.chooseVideo', () => configureCategory(context, getActiveCategory())),
    vscode.commands.registerCommand('subwayPlayer.watchTwitch', () => watchTwitch(context)),
    vscode.commands.registerCommand('subwayPlayer.next', () => panel?.webview.postMessage({ type: 'next' })),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('subwayPlayer')) {
        updateStatusBar();
      }
      if (panel && event.affectsConfiguration('subwayPlayer')) {
        render(panel, context);
      }
    })
  );

  if (getConfig().get<boolean>('openOnStartup')) {
    openPlayer(context);
  }
}

export function deactivate() {
  panel?.dispose();
}

function getConfig() {
  return vscode.workspace.getConfiguration('subwayPlayer');
}

// ---------- Catégories ----------

function getCategories(): Record<string, string> {
  return getConfig().get<Record<string, string>>('categories') ?? {};
}

function getActiveCategory(): string {
  return getConfig().get<string>('activeCategory') || Object.keys(getCategories())[0] || 'Subway Surfers';
}

async function setCategorySource(name: string, source: string) {
  // On n'écrit que les valeurs de l'utilisateur : les catégories par défaut sont fusionnées par l'éditeur.
  const userCategories = getConfig().inspect<Record<string, string>>('categories')?.globalValue ?? {};
  await getConfig().update('categories', { ...userCategories, [name]: source }, vscode.ConfigurationTarget.Global);
}

async function setActiveCategory(name: string) {
  await getConfig().update('activeCategory', name, vscode.ConfigurationTarget.Global);
}

/** La v0.1 n'avait qu'un réglage `videoSource` : on le range dans la catégorie Subway Surfers. */
async function migrateLegacyVideoSource() {
  const legacy = getConfig().get<string>('videoSource')?.trim();
  if (!legacy) {
    return;
  }
  if (!getCategories()['Subway Surfers']) {
    await setCategorySource('Subway Surfers', legacy);
  }
  await getConfig().update('videoSource', undefined, vscode.ConfigurationTarget.Global);
}

async function chooseCategory(context: vscode.ExtensionContext) {
  const categories = getCategories();
  const active = getActiveCategory();

  type Item = vscode.QuickPickItem & { action: 'select' | 'add' | 'twitch'; name?: string };
  const items: Item[] = [
    ...Object.entries(categories).map(([name, source]) => ({
      label: `${name === active ? '$(check)' : '$(blank)'} ${name}`,
      description: source ? describeSource(source) : 'à configurer',
      action: 'select' as const,
      name,
    })),
    { label: '', kind: vscode.QuickPickItemKind.Separator, action: 'select' },
    { label: '$(broadcast) Regarder un stream Twitch…', action: 'twitch' },
    { label: '$(add) Nouvelle catégorie…', action: 'add' },
  ];

  const picked = await vscode.window.showQuickPick(items, { title: 'Subway Player : catégorie', placeHolder: 'Que veux-tu regarder en codant ?' });
  if (!picked) {
    return;
  }
  if (picked.action === 'twitch') {
    return watchTwitch(context);
  }

  let name = picked.name;
  if (picked.action === 'add') {
    name = (await vscode.window.showInputBox({ title: 'Nouvelle catégorie', prompt: 'Nom de la catégorie (ex. Parkour Minecraft)' }))?.trim();
  }
  if (!name) {
    return;
  }

  if (!categories[name]) {
    const configured = await configureCategory(context, name);
    if (!configured) {
      return;
    }
  }
  await setActiveCategory(name);
  openPlayer(context);
}

async function cycleCategory(context: vscode.ExtensionContext) {
  const configured = Object.entries(getCategories())
    .filter(([, source]) => source)
    .map(([name]) => name);
  if (configured.length === 0) {
    return chooseCategory(context);
  }
  const next = configured[(configured.indexOf(getActiveCategory()) + 1) % configured.length];
  await setActiveCategory(next);
  openPlayer(context);
  vscode.window.setStatusBarMessage(`Subway Player : ${next}`, 2000);
}

/** Demande une source (fichier, dossier ou lien) pour une catégorie. Renvoie true si elle a été enregistrée. */
async function configureCategory(context: vscode.ExtensionContext, name: string): Promise<boolean> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(file-media) Fichier ou dossier de vidéos…', id: 'file' },
      { label: '$(link) Lien : YouTube, Twitch ou URL directe…', id: 'link' },
    ],
    { title: `Source de « ${name} »`, placeHolder: 'Un dossier enchaîne ses vidéos au hasard' }
  );
  if (!choice) {
    return false;
  }

  let source: string | undefined;
  if (choice.id === 'file') {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: `Utiliser pour ${name}`,
      filters: { Vidéos: VIDEO_EXTENSIONS.map((ext) => ext.slice(1)) },
    });
    source = picked?.[0]?.fsPath;
  } else {
    source = (await vscode.window.showInputBox({ title: `Lien pour « ${name} »`, prompt: 'https://youtube.com/…, https://twitch.tv/…, ou un lien direct vers un .mp4 / .webm' }))?.trim();
  }
  if (!source) {
    return false;
  }

  await setCategorySource(name, source);
  await setActiveCategory(name);
  openPlayer(context);
  return true;
}

async function watchTwitch(context: vscode.ExtensionContext) {
  const current = getCategories()[TWITCH_CATEGORY];
  const input = await vscode.window.showInputBox({
    title: 'Regarder un stream Twitch',
    prompt: 'Lien de la chaîne (https://twitch.tv/…) ou simplement son nom',
    value: current ? parseTwitchChannel(current) : undefined,
    validateInput: (value) => (toTwitchChannel(value) ? undefined : 'Lien ou nom de chaîne Twitch invalide'),
  });
  const login = input ? toTwitchChannel(input) : undefined;
  if (!login) {
    return;
  }
  await setCategorySource(TWITCH_CATEGORY, `https://twitch.tv/${login}`);
  await setActiveCategory(TWITCH_CATEGORY);
  openPlayer(context);
}

function toTwitchChannel(value: string): string | undefined {
  const trimmed = value.trim();
  return parseTwitchChannel(trimmed) ?? (/^[A-Za-z0-9_]{3,25}$/.test(trimmed) ? trimmed.toLowerCase() : undefined);
}

function describeSource(source: string): string {
  const twitch = parseTwitchChannel(source);
  if (twitch) {
    return `Twitch : ${twitch}`;
  }
  if (YOUTUBE_PATTERN.test(source)) {
    return 'YouTube';
  }
  return /^https?:\/\//i.test(source) ? source : path.basename(source) || source;
}

// ---------- Player ----------

function updateStatusBar() {
  statusBarItem.text = panel ? `$(debug-stop) ${getActiveCategory()}` : '$(play) Subway';
  statusBarItem.tooltip = panel ? 'Masquer le Subway Player' : 'Afficher le Subway Player';
  if (getConfig().get<boolean>('showStatusBarButton')) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

function openPlayer(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(undefined, true);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'subwayPlayer',
    'Subway Player',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

  panel.onDidDispose(() => {
    panel = undefined;
    updateStatusBar();
  });

  // Ne pas consommer de CPU quand l'onglet n'est pas visible.
  panel.onDidChangeViewState(({ webviewPanel }) => {
    webviewPanel.webview.postMessage({ type: webviewPanel.visible ? 'resume' : 'pause' });
  });

  panel.webview.onDidReceiveMessage((message) => {
    switch (message?.type) {
      case 'chooseVideo':
        return configureCategory(context, getActiveCategory());
      case 'chooseCategory':
        return chooseCategory(context);
      case 'openSettings':
        return vscode.commands.executeCommand('workbench.action.openSettings', 'subwayPlayer');
      case 'retry':
        return panel && render(panel, context);
      case 'openExternal':
        if (typeof message.url === 'string' && /^https:\/\//.test(message.url)) {
          return vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
    }
  });

  render(panel, context);
  updateStatusBar();
}

function resolveSource(raw: string): VideoSource {
  const value = raw.trim();
  if (!value) {
    return { kind: 'none' };
  }

  const twitch = parseTwitchChannel(value);
  if (twitch) {
    return { kind: 'twitch', login: twitch };
  }
  const youtube = value.match(YOUTUBE_PATTERN);
  if (youtube) {
    return { kind: 'youtube', id: youtube[1] };
  }
  if (/^https?:\/\//i.test(value)) {
    return { kind: 'url', url: value };
  }

  const fsPath = resolveLocalPath(value);
  if (!fs.existsSync(fsPath)) {
    return { kind: 'error', message: `Introuvable : ${fsPath}` };
  }

  if (fs.statSync(fsPath).isDirectory()) {
    const files = fs
      .readdirSync(fsPath)
      .filter((name) => VIDEO_EXTENSIONS.includes(path.extname(name).toLowerCase()))
      .map((name) => vscode.Uri.file(path.join(fsPath, name)));
    if (files.length === 0) {
      return { kind: 'error', message: `Aucune vidéo dans le dossier : ${fsPath}` };
    }
    return { kind: 'files', uris: files, roots: [vscode.Uri.file(fsPath)] };
  }

  return { kind: 'files', uris: [vscode.Uri.file(fsPath)], roots: [vscode.Uri.file(path.dirname(fsPath))] };
}

function resolveLocalPath(value: string): string {
  if (value.startsWith('file://')) {
    return vscode.Uri.parse(value).fsPath;
  }
  if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(1));
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return path.resolve(workspaceRoot ?? os.homedir(), value);
}

async function toWebviewSource(source: VideoSource, webview: vscode.Webview): Promise<WebviewSource> {
  switch (source.kind) {
    case 'files':
      return { kind: 'files', urls: source.uris.map((uri) => webview.asWebviewUri(uri).toString()) };
    case 'twitch':
      try {
        return { kind: 'twitch', login: source.login, url: await getTwitchStreamUrl(source.login) };
      } catch (error) {
        const offline = error instanceof TwitchError && error.offline;
        return { kind: 'twitch-error', login: source.login, message: (error as Error).message, offline };
      }
    default:
      return source;
  }
}

async function render(target: vscode.WebviewPanel, context: vscode.ExtensionContext) {
  const currentRender = ++renderId;
  const config = getConfig();
  const category = getActiveCategory();
  const source = resolveSource(getCategories()[category] ?? '');
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');

  target.title = `Subway Player · ${category}`;
  target.webview.options = {
    enableScripts: true,
    localResourceRoots: source.kind === 'files' ? [mediaRoot, ...source.roots] : [mediaRoot],
  };

  if (source.kind === 'twitch') {
    target.webview.html = getHtml(target.webview, context.extensionUri, { loading: `Connexion au stream de ${source.login}…`, category });
  }

  const webviewSource = await toWebviewSource(source, target.webview);
  // Un autre rendu a pu démarrer pendant qu'on attendait Twitch.
  if (currentRender !== renderId || panel !== target) {
    return;
  }

  target.webview.html = getHtml(target.webview, context.extensionUri, {
    category,
    source: webviewSource,
    muted: config.get<boolean>('muted', true),
    playbackRate: config.get<number>('playbackRate', 1),
    showControls: config.get<boolean>('showControls', false),
  });
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri, state: unknown): string {
  const nonce = createNonce();
  const mediaUri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', file));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} https: data:`,
    `media-src ${webview.cspSource} https: http: blob:`,
    // Twitch : hls.js télécharge la playlist et les segments du live depuis plusieurs CDN.
    'connect-src https:',
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
  ].join('; ');

  // Le JSON est échappé pour pouvoir être injecté sans risque dans une balise <script>.
  const serializedState = JSON.stringify(state).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${mediaUri('player.css')}">
  <title>Subway Player</title>
</head>
<body>
  <main id="root"></main>
  <script nonce="${nonce}">window.__SUBWAY_STATE__ = ${serializedState};</script>
  <script nonce="${nonce}" src="${mediaUri('vendor/hls.light.min.js')}"></script>
  <script nonce="${nonce}" src="${mediaUri('player.js')}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
