// Copie hls.js (lecture des streams Twitch) dans media/vendor pour qu'il soit embarqué dans le .vsix.
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'media', 'vendor');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(require.resolve('hls.js/dist/hls.light.min.js'), path.join(target, 'hls.light.min.js'));
