import * as https from 'https';

// Client ID public du lecteur web de Twitch (le même qu'utilisent streamlink et le site twitch.tv).
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const TWITCH_URL_PATTERN = /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})\/?(?:[?#].*)?$/i;
const TWITCH_PREFIX_PATTERN = /^twitch:([A-Za-z0-9_]{3,25})$/i;

const PLAYBACK_TOKEN_QUERY = `query PlaybackAccessToken($login: String!) {
  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: "embed"}) {
    value
    signature
  }
}`;

export class TwitchError extends Error {
  constructor(message: string, readonly offline = false) {
    super(message);
  }
}

/** Renvoie le nom de la chaîne pour `https://twitch.tv/xxx` ou `twitch:xxx`, sinon undefined. */
export function parseTwitchChannel(value: string): string | undefined {
  const match = value.trim().match(TWITCH_URL_PATTERN) ?? value.trim().match(TWITCH_PREFIX_PATTERN);
  const login = match?.[1].toLowerCase();
  const reservedPaths = ['directory', 'videos', 'settings', 'search', 'downloads', 'p', 'subscriptions'];
  return login && !reservedPaths.includes(login) ? login : undefined;
}

/**
 * Récupère l'URL HLS du live. Le lecteur intégrable officiel de Twitch refuse d'être affiché dans
 * une webview (contrôle du paramètre `parent`), donc on lit le flux HLS directement.
 */
export async function getTwitchStreamUrl(login: string): Promise<string> {
  const response = await request('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': TWITCH_WEB_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PLAYBACK_TOKEN_QUERY, variables: { login } }),
  });
  if (response.status !== 200) {
    throw new TwitchError(`Twitch a répondu ${response.status} en demandant l'accès au stream.`);
  }

  const token = JSON.parse(response.body)?.data?.streamPlaybackAccessToken;
  if (!token?.value || !token?.signature) {
    throw new TwitchError(`La chaîne Twitch « ${login} » n'existe pas.`);
  }

  const params = new URLSearchParams({
    sig: token.signature,
    token: token.value,
    allow_source: 'true',
    allow_audio_only: 'false',
    fast_bread: 'true',
    player: 'twitchweb',
    p: String(Math.floor(Math.random() * 1_000_000)),
  });
  const playlistUrl = `https://usher.ttvnw.net/api/channel/hls/${login}.m3u8?${params}`;

  const playlist = await request(playlistUrl, { method: 'GET' });
  if (playlist.status === 404) {
    throw new TwitchError(`${login} n'est pas en live pour le moment.`, true);
  }
  if (playlist.status !== 200) {
    throw new TwitchError(`Impossible d'ouvrir le stream de ${login} (erreur ${playlist.status}).`);
  }
  return playlistUrl;
}

function request(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: options.method, headers: options.headers, timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new TwitchError('Twitch ne répond pas.')));
    req.on('error', (error) => reject(error instanceof TwitchError ? error : new TwitchError(`Twitch injoignable : ${error.message}`)));
    req.end(options.body);
  });
}
