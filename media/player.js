// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const state = window.__SUBWAY_STATE__;
  const root = document.getElementById('root');

  /** @type {HTMLVideoElement | null} */
  let video = null;
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

  function showEmpty(title, detail) {
    root.replaceChildren(
      el('div', { class: 'empty' }, [
        el('div', { class: 'logo', text: '🛹' }),
        el('h1', { text: title }),
        el('p', { text: detail }),
        el('div', { class: 'actions' }, [
          el('button', { text: 'Choisir une vidéo…', onclick: () => vscode.postMessage({ type: 'chooseVideo' }) }),
          el('button', { class: 'secondary', text: 'Réglages', onclick: () => vscode.postMessage({ type: 'openSettings' }) }),
        ]),
      ])
    );
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
    video = /** @type {HTMLVideoElement} */ (el('video', { playsinline: '', autoplay: '' }));
    video.muted = state.muted;
    video.controls = state.showControls;
    video.loop = playlist.length === 1;
    video.addEventListener('loadedmetadata', () => (video.playbackRate = state.playbackRate));
    video.addEventListener('ended', () => playAt(index + 1));
    video.addEventListener('error', () =>
      showEmpty(
        'Impossible de lire cette vidéo',
        'Le format n’est peut-être pas supporté par l’éditeur. Essaie un fichier .webm (VP9) ou un .mp4 (H.264).'
      )
    );
    // Double-clic : vidéo suivante (utile avec un dossier de vidéos).
    video.addEventListener('dblclick', () => playAt(index + 1));
    root.replaceChildren(el('div', { class: 'stage' }, [video]));
    playAt(0);
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
    root.replaceChildren(el('div', { class: 'stage' }, [frame]));
  }

  const source = state.source;
  switch (source.kind) {
    case 'files':
      showVideo(source.urls);
      break;
    case 'url':
      showVideo([source.url]);
      break;
    case 'youtube':
      showYoutube(source.id);
      break;
    case 'error':
      showEmpty('Vidéo introuvable', source.message);
      break;
    default:
      showEmpty(
        'Aucune vidéo configurée',
        'Choisis un fichier ou un dossier de gameplay (Subway Surfers, Minecraft parkour…) pour le lire en boucle à côté de ton code.'
      );
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!video) return;
    if (message.type === 'pause') video.pause();
    else if (message.type === 'resume') video.play().catch(() => {});
    else if (message.type === 'next') playAt(index + 1);
  });
})();
