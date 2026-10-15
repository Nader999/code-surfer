import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];
const YOUTUBE_PATTERN = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

type VideoSource =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'files'; uris: vscode.Uri[]; roots: vscode.Uri[] }
  | { kind: 'url'; url: string }
  | { kind: 'youtube'; id: string };

let panel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'subwayPlayer.toggle';
  updateStatusBar();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('subwayPlayer.open', () => openPlayer(context)),
    vscode.commands.registerCommand('subwayPlayer.close', () => panel?.dispose()),
    vscode.commands.registerCommand('subwayPlayer.toggle', () => (panel ? panel.dispose() : openPlayer(context))),
    vscode.commands.registerCommand('subwayPlayer.chooseVideo', () => chooseVideo(context)),
    vscode.commands.registerCommand('subwayPlayer.next', () => panel?.webview.postMessage({ type: 'next' })),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('subwayPlayer.showStatusBarButton')) {
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

function updateStatusBar() {
  statusBarItem.text = panel ? '$(debug-stop) Subway' : '$(play) Subway';
  statusBarItem.tooltip = panel ? 'Masquer le Subway Player' : 'Afficher le Subway Player';
  if (getConfig().get<boolean>('showStatusBarButton')) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

function openPlayer(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true);
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
    if (message?.type === 'chooseVideo') {
      chooseVideo(context);
    } else if (message?.type === 'openSettings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'subwayPlayer');
    }
  });

  render(panel, context);
  updateStatusBar();
}

async function chooseVideo(context: vscode.ExtensionContext) {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Utiliser cette vidéo',
    filters: { Vidéos: VIDEO_EXTENSIONS.map((ext) => ext.slice(1)) },
  });
  if (!picked?.[0]) {
    return;
  }
  await getConfig().update('videoSource', picked[0].fsPath, vscode.ConfigurationTarget.Global);
  if (!panel) {
    openPlayer(context);
  }
}

function resolveSource(raw: string): VideoSource {
  const value = raw.trim();
  if (!value) {
    return { kind: 'none' };
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

function render(target: vscode.WebviewPanel, context: vscode.ExtensionContext) {
  const config = getConfig();
  const source = resolveSource(config.get<string>('videoSource') ?? '');
  const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media');

  target.webview.options = {
    enableScripts: true,
    localResourceRoots: source.kind === 'files' ? [mediaRoot, ...source.roots] : [mediaRoot],
  };

  const state = {
    source:
      source.kind === 'files'
        ? { kind: 'files', urls: source.uris.map((uri) => target.webview.asWebviewUri(uri).toString()) }
        : source,
    muted: config.get<boolean>('muted', true),
    playbackRate: config.get<number>('playbackRate', 1),
    showControls: config.get<boolean>('showControls', false),
  };

  target.webview.html = getHtml(target.webview, context.extensionUri, state);
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri, state: unknown): string {
  const nonce = createNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'player.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'player.css'));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} https: data:`,
    `media-src ${webview.cspSource} https: http: blob:`,
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
  <link rel="stylesheet" href="${styleUri}">
  <title>Subway Player</title>
</head>
<body>
  <main id="root"></main>
  <script nonce="${nonce}">window.__SUBWAY_STATE__ = ${serializedState};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
