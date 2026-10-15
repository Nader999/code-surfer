// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const state = window.__SUBWAY_STATE__;
  const root = document.getElementById('root');

  /** @type {HTMLVideoElement | null} */
  let video = null;
  /** @type {any} */
  let hls = null;
  let playlist = [];
  let index = 0;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === 'onclick') node.addEventListener('click', value);
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => node.appendChild(child));
    return node;
  }

  const send = (type, extra) => () => vscode.postMessage(Object.assign({ type }, extra));

  const actions = {
    chooseVideo: { text: 'Choisir une vidéo…', onclick: send('chooseVideo') },
    chooseCategory: { class: 'secondary', text: 'Changer de catégorie', onclick: send('chooseCategory') },
    settings: { class: 'secondary', text: 'Réglages', onclick: send('openSettings') },
    retry: { text: 'Réessayer', onclick: send('retry') },
  };

  function showMessage(icon, title, detail, buttons) {
    destroyPlayer();
    root.replaceChildren(
      el('div', { class: 'empty' }, [
        el('div', { class: 'logo', text: icon }),
        el('h1', { text: title }),
        el('p', { text: detail }),
        el('div', { class: 'actions' }, (buttons || []).map((attrs) => el('button', attrs))),
      ])
    );
  }

  function categoryBadge() {
    return el('button', { class: 'badge', title: 'Changer de catégorie', text: `⇄ ${state.category}`, onclick: send('chooseCategory') });
  }

  function muteBadge() {
    const badge = el('button', { class: 'badge mute', title: 'Activer / couper le son' });
    const refresh = () => (badge.textContent = video && video.muted ? '🔇' : '🔊');
    badge.addEventListener('click', () => {
      if (!video) return;
      video.muted = !video.muted;
      refresh();
    });
    refresh();
    return badge;
  }

  function mountStage(media) {
    const stage = el('div', { class: 'stage' }, [media, el('div', { class: 'toolbar' }, [categoryBadge(), muteBadge()])]);
    root.replaceChildren(stage);
  }

  function destroyPlayer() {
    if (hls) hls.destroy();
    hls = null;
    video = null;
  }

  function createVideo(loop) {
    const media = /** @type {HTMLVideoElement} */ (el('video', { playsinline: '', autoplay: '' }));
    media.muted = state.muted;
    media.controls = state.showControls;
    media.loop = loop;
    media.addEventListener('loadedmetadata', () => (media.playbackRate = state.playbackRate));
    return media;
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function playAt(position) {
    if (!video || playlist.length === 0) return;
    index = (position + playlist.length) % playlist.length;
    video.src = playlist[index];
    video.play().catch(() => {});
  }

  function showVideo(urls) {
    playlist = shuffle(urls);
    video = createVideo(playlist.length === 1);
    video.addEventListener('ended', () => playAt(index + 1));
    video.addEventListener('error', () =>
      showMessage('⚠️', 'Impossible de lire cette vidéo', 'Le format n’est peut-être pas supporté par l’éditeur. Essaie un fichier .webm (VP9) ou un .mp4 (H.264).', [
        actions.chooseVideo,
        actions.chooseCategory,
      ])
    );
    // Double-clic : vidéo suivante (utile avec un dossier de vidéos).
    video.addEventListener('dblclick', () => playAt(index + 1));
    mountStage(video);
    playAt(0);
  }

  function showTwitch(login, url) {
    const channelUrl = `https://www.twitch.tv/${login}`;
    const failed = (detail) =>
      showMessage('📡', `Le stream de ${login} s’est coupé`, detail, [actions.retry, { class: 'secondary', text: 'Ouvrir sur Twitch', onclick: send('openExternal', { url: channelUrl }) }, actions.chooseCategory]);

    video = createVideo(false);
    // Un stream doit rester entier à l'écran (chat, webcam), on ne le recadre pas.
    video.classList.add('contain');
    // Un live ne doit jamais être accéléré.
    video.addEventListener('loadedmetadata', () => video && (video.playbackRate = 1));
    mountStage(video);

    const Hls = /** @type {any} */ (window).Hls;
    if (Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: false, capLevelToPlayerSize: true, liveSyncDurationCount: 3 });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else failed(`Erreur réseau (${data.details}). Le live est peut-être terminé.`);
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video && video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().catch(() => {});
    } else {
      failed('Cet éditeur ne sait pas lire les flux HLS.');
    }
    video.addEventListener('ended', () => failed('Le live est terminé.'));
  }

  function showYoutube(id) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: state.muted ? '1' : '0',
      loop: '1',
      playlist: id,
      controls: state.showControls ? '1' : '0',
      modestbranding: '1',
      rel: '0',
      playsinline: '1',
    });
    const frame = el('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
      allow: 'autoplay; encrypted-media; picture-in-picture',
      referrerpolicy: 'strict-origin-when-cross-origin',
      allowfullscreen: '',
    });
    const stage = el('div', { class: 'stage' }, [frame, el('div', { class: 'toolbar' }, [categoryBadge()])]);
    root.replaceChildren(stage);
  }

  function start() {
    if (state.loading) {
      showMessage('📡', state.loading, '', []);
      return;
    }
    const source = state.source;
    switch (source.kind) {
      case 'files':
        return showVideo(source.urls);
      case 'url':
        return showVideo([source.url]);
      case 'youtube':
        return showYoutube(source.id);
      case 'twitch':
        return showTwitch(source.login, source.url);
      case 'twitch-error':
        return showMessage(source.offline ? '😴' : '📡', source.offline ? 'Pas de live en ce moment' : 'Stream Twitch indisponible', source.message, [
          actions.retry,
          actions.chooseCategory,
        ]);
      case 'error':
        return showMessage('🔎', 'Vidéo introuvable', source.message, [actions.chooseVideo, actions.chooseCategory]);
      default:
        return showMessage('🛹', `« ${state.category} » n’a pas encore de vidéo`, 'Choisis un fichier, un dossier ou un lien pour cette catégorie. Elle sera lue en boucle, sans le son, à côté de ton code.', [
          actions.chooseVideo,
          actions.chooseCategory,
          actions.settings,
        ]);
    }
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!video) return;
    if (message.type === 'pause' && !hls) video.pause();
    else if (message.type === 'resume') video.play().catch(() => {});
    else if (message.type === 'next') playAt(index + 1);
  });

  start();
})();
