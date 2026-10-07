# Play7 🎵

A web music player where **every playlist is a hand-written doubly linked list**.
Built with TypeScript for the Data Structures course.

## Features

- Multiple playlists: create, name, select and delete.
- **Add Local Songs**: pick your own `.mp3`, `.wav`, `.ogg`… from your computer (no preloaded songs).
- **Search Online**: find songs on the internet and play them **in full** through YouTube's official embedded player (search uses the YouTube Data API), plus independent tracks from [Audius](https://audius.co). Listen right away **without adding them**, or add them to any playlist.
- **Home** screen with what is popular right now (YouTube chart, or Audius trending), playable without adding.
- **Liked Songs**: press the ♡ on any song; it is a built-in list with its own linked list (newest first, using `addFirst`).
- **Shuffle** or list order: shuffle picks a random song that has not played yet in the round, without reordering the list.
- Play, Pause, Next, Previous, Repeat, progress bar, volume, elapsed time and duration.
- Reorder songs with **drag & drop** (or the ↑ ↓ buttons).
- **Linked List View**: shows the real chain of nodes (`HEAD`, `TAIL`, `CURRENT`, every `prev` / `next`) and can be traversed forward or backward.
- Playlists are remembered between visits (localStorage + IndexedDB for local files).

## The data structure

```
Song → SongNode → DoublyLinkedList → Playlist → MusicPlayer → Web interface
```

`src/structures/DoublyLinkedList.ts` stores songs only as `SongNode` objects linked by `prev` and `next`.
No array (`push`, `pop`, `splice`…) is used to hold or reorder the songs.

| Operation | Method | Cost |
|---|---|---|
| Add at the beginning / end | `addFirst()` / `addLast()` | O(1) |
| Insert at a position | `insert(index, song)` | O(n) |
| Remove a node | `remove(node)` / `removeAt(index)` | O(n) |
| Find by id / by position | `find(id)` / `getAt(index)` | O(n) |
| Move a song | `move(from, to)` | O(n) |
| Forward / backward traversal | `forEachForward()` / `forEachBackward()` | O(n) |

### Why playback never gets out of sync

`MusicPlayer` does not keep the *index* of the current song. It keeps a reference to the
current **node**. Next and Previous just follow `currentNode.next` and `currentNode.prev`,
and `move()` re-links the same node object instead of creating a new one. So after any
reorder, insert or removal, "what plays next" is always what the list shows on screen.

The external API only supplies song information and an audio URL. The list, the playlists
and the playback logic are our own code.

## Project structure

```
src/
├── models/        Song.ts, SongNode.ts, Playlist.ts
├── structures/    DoublyLinkedList.ts
├── player/        MusicPlayer.ts, AudioEngine.ts, YouTubeEngine.ts, RoutingAudioEngine.ts
├── services/      MusicSearch.ts (YouTube + Audius), LocalFiles.ts, Storage.ts
└── main.ts        user interface
tests/             automated tests (list + player logic)
index.html, style.css
```

## YouTube search key

Searching YouTube needs a free API key:

1. Go to <https://console.cloud.google.com>, create a project and enable **YouTube Data API v3**.
2. **APIs & Services → Credentials → Create credentials → API key**.
3. Restrict the key: *API restrictions* → YouTube Data API v3; *Website restrictions* →
   `http://localhost:5173/*` and `https://juandavid100.github.io/*`.
4. On your computer: copy `.env.example` to `.env` and paste the key there (`.env` is ignored by git).
5. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name `VITE_YOUTUBE_API_KEY`.

Without a key the app still works: search falls back to 30-second previews and Audius.

## Run it

```bash
npm install
npm run dev      # development server
npm test         # automated tests
npm run build    # type-check + production build in dist/
```

## Tests

`npm test` runs 41 automated tests. The main cases:

| # | Action | Expected result |
|---|---|---|
| 1 | Create playlist (empty or duplicate name) | Created / rejected with a message |
| 2 | Add songs | Songs appear at the end, links consistent both ways |
| 3 | Play / Pause | Starts at head, resumes the same song |
| 4 | Next / Previous | Follows `next` / `prev` |
| 5 | Empty playlist: Play, Next, Previous | No crash, clear message |
| 6 | Single song: Next, Previous, song ends | Stays on it, then stops |
| 7 | Next on the last song / Previous on the first | No crash, stays on the song |
| 8 | Remove the current song | Jumps to its successor and keeps playing |
| 9 | Remove the only song | Player stops cleanly |
| 10 | Remove the next song | It is skipped |
| 11 | Move the current song | Keeps playing, continues from its new position |
| 12 | Move the next song | The new neighbour plays next |
| 13 | Reorder while playing (S1 playing, S2 dragged above it, S1 ends) | S3 plays |
| 14 | Add a song while another plays | Playback unaffected, new song plays in its place |
| 15 | Switch playlist while playing | Music continues from the original playlist |
| 16 | Delete the playlist that is playing | Playback stops |
| 17 | Shuffle | Every song plays exactly once per round; the list order is untouched |
| 18 | Like / unlike a song, also while it is playing | Liked Songs updates; playback continues |
| 19 | Listen to a search result without adding it | It plays, playlists stay unchanged, Next goes to the next result |

## Deployment

Every push to `main` runs the tests, builds the project and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). Enable it once in the repository:
**Settings → Pages → Source: GitHub Actions**.

Public URL: https://juandavid100.github.io/play7-music-player/
