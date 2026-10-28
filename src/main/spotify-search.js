'use strict';

const { shell } = require('electron');

function searchSpotify(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  const encoded = encodeURIComponent(q);
  return [
    {
      id: `spotify-search-${encoded}`,
      title: `Search Spotify: "${q}"`,
      subtitle: 'Open search in Spotify desktop app or web',
      icon: '🟢',
      group: 'Media',
      keywords: ['spotify', 'music', 'song', 'artist', 'album', 'podcast', q],
      actions: [
        {
          id: 'open-spotify-desktop',
          title: 'Open in Spotify Desktop',
          run: () => shell.openExternal(`spotify:search:${encoded}`)
        },
        {
          id: 'open-spotify-web',
          title: 'Open in Spotify Web Player',
          run: () => shell.openExternal(`https://open.spotify.com/search/${encoded}`)
        }
      ]
    }
  ];
}

module.exports = {
  searchSpotify
};
