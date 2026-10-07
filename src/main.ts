import { Playlist } from "./models/Playlist";
import { Song } from "./models/Song";
import { SongNode } from "./models/SongNode";
import { BrowserAudioEngine } from "./player/AudioEngine";
import { RoutingAudioEngine } from "./player/RoutingAudioEngine";
import { YouTubeEngine } from "./player/YouTubeEngine";
import { ActionResult, LIKED_ID, MusicPlayer } from "./player/MusicPlayer";
import { deleteFile, songFromFile } from "./services/LocalFiles";
import { getRecommendations, hasYouTubeKey, isPreview, isYouTube, searchSongs } from "./services/MusicSearch";
import { restoreState, saveState } from "./services/Storage";

// Normal audio and YouTube behind one engine; the song's URL picks which one plays.
const engine = new RoutingAudioEngine(
    new BrowserAudioEngine(),
    new YouTubeEngine(document.getElementById("yt-player") as HTMLElement)
);
const stage = document.getElementById("yt-box") as HTMLElement;
const scroller = document.getElementById("main-scroll") as HTMLElement;

engine.onYouTubeActive = (active) => {
    const wasShown = stage.classList.contains("show");
    stage.classList.toggle("show", active);
    // A new video starts in cinema view, at the top.
    if (active && !wasShown) {
        setCompact(false);
        scroller.scrollTop = 0;
    }
};

/** True when the video was shrunk by scrolling (not by the button). */
let shrunkByScroll = false;

function setCompact(compact: boolean): void {
    stage.classList.toggle("compact", compact);
    document.getElementById("stage-size")!.textContent = compact ? "Cinema view" : "Compact view";
    if (!compact) shrunkByScroll = false;
}

// The stage is pinned at the top of the scrolling area. Scrolling down (from
// anywhere, even with the mouse over the video) shrinks it so the playlist
// has room; scrolling up again at the very top brings the cinema view back.
scroller.addEventListener("scroll", () => {
    if (!stage.classList.contains("show") || stage.classList.contains("compact")) return;
    if (scroller.scrollTop > 24) {
        setCompact(true);
        shrunkByScroll = true;
        // Shrinking already reveals the content below, so start from the top.
        scroller.scrollTop = 0;
    }
});
scroller.addEventListener(
    "wheel",
    (event) => {
        if (shrunkByScroll && event.deltaY < 0 && scroller.scrollTop <= 0) setCompact(false);
    },
    { passive: true }
);
const player = new MusicPlayer(engine);

function sourceLabel(song: Song): string {
    if (isYouTube(song)) return "YouTube";
    if (isPreview(song)) return "30s preview";
    return song.source === "local" ? "local" : "full song";
}

// ---- helpers -------------------------------------------------------------

function $<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

let toastTimer = 0;
function toast(message: string, isError = false): void {
    if (!message) return;
    const el = $("toast");
    el.textContent = message;
    el.className = `toast show${isError ? " error" : ""}`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (el.className = "toast"), 2600);
}

/** Shows the outcome of an action; errors always, successes only when asked. */
function report(result: ActionResult, showSuccess = false): void {
    if (!result.ok) toast(result.message, true);
    else if (showSuccess) toast(result.message);
}

// ---- view state ------------------------------------------------------------

type Page = "home" | "search" | "playlist";
let page: Page = "home";
let activeTab = "songs";
/** Songs suggested on the home screen: their own linked list, playable without saving. */
let recs = new Playlist("recommended", "Recommended");
let recsStatus = "Loading…";
/** Playlist that receives songs added from Home or Search. */
let addTargetId = "";
let direction: "forward" | "backward" = "forward";
/** Search results live in their own linked list so they can be played without saving them. */
let results = new Playlist("search-results", "Search results");
let searchStatus = ""; // message shown instead of results (searching, empty, error)
let dragFrom = -1;

// ---- pages -----------------------------------------------------------------

function showPage(next: Page): void {
    page = next;
    $("page-home").hidden = page !== "home";
    $("page-search").hidden = page !== "search";
    $("page-playlist").hidden = page !== "playlist";
    document.querySelectorAll<HTMLElement>(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.page === page);
    });
    scroller.scrollTop = 0;
    render();
}

function openPlaylist(playlistId: string): void {
    const result = player.selectPlaylist(playlistId);
    report(result);
    if (result.ok) showPage("playlist");
}

function heartButton(song: Song): string {
    const liked = player.isLiked(song.id);
    const label = liked ? "Remove from Liked Songs" : "Add to Liked Songs";
    return `<button class="heart${liked ? " on" : ""}" data-action="like" title="${label}" aria-label="${label}" aria-pressed="${liked}">${liked ? "♥" : "♡"}</button>`;
}

// ---- rendering -------------------------------------------------------------

function renderPlaylists(): void {
    const onPlaylistPage = page === "playlist";
    let html = "";
    for (const playlist of player.playlists.values()) {
        const selected = onPlaylistPage && playlist === player.selectedPlaylist ? " selected" : "";
        const dot = playlist === player.playingPlaylist ? '<span class="playing-dot" title="Playing">♪</span>' : "";
        html += `<li class="${selected}">
            <button class="pick" data-action="select-playlist" data-id="${playlist.id}">
                <span translate="no">${dot}${escapeHtml(playlist.name)}</span><span class="count">${playlist.size}</span>
            </button>
            <button class="del" data-action="delete-playlist" data-id="${playlist.id}" title="Delete playlist" aria-label="Delete playlist ${escapeHtml(playlist.name)}">✕</button>
        </li>`;
    }
    $("playlist-list").innerHTML = html || '<li class="empty">No playlists yet.<br>Create your first one above.</li>';
    $("liked-count").textContent = String(player.liked.size);
    $("liked-link").classList.toggle("selected", onPlaylistPage && player.selectedPlaylist === player.liked);
}

/** Fills every "Add to" selector with the user's playlists and keeps them in sync. */
function renderAddTargets(): void {
    if (!player.playlists.has(addTargetId)) {
        const selected = player.selectedPlaylist;
        addTargetId = selected && selected !== player.liked ? selected.id : (player.playlists.keys().next().value ?? "");
    }
    let options = "";
    for (const playlist of player.playlists.values()) {
        options += `<option value="${playlist.id}"${playlist.id === addTargetId ? " selected" : ""}>${escapeHtml(playlist.name)}</option>`;
    }
    document.querySelectorAll<HTMLSelectElement>("select.add-target").forEach((select) => {
        select.innerHTML = options || '<option value="">No playlists yet</option>';
    });
}

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 19) return "Good afternoon";
    return "Good evening";
}

function renderHome(): void {
    $("home-greeting").textContent = greeting();
    // Shortcuts to your own lists.
    let tiles = `<button class="tile liked" data-open="${LIKED_ID}">
        <span class="tile-art" aria-hidden="true">♥</span>
        <span class="tile-text"><strong>Liked Songs</strong><span>${player.liked.size} ${player.liked.size === 1 ? "song" : "songs"}</span></span>
    </button>`;
    for (const playlist of player.playlists.values()) {
        tiles += `<button class="tile" data-open="${playlist.id}">
            <span class="tile-art" aria-hidden="true">♪</span>
            <span class="tile-text"><strong translate="no">${escapeHtml(playlist.name)}</strong><span>${playlist.size} ${playlist.size === 1 ? "song" : "songs"}</span></span>
        </button>`;
    }
    $("home-tiles").innerHTML = tiles;

    if (recsStatus) {
        $("recs").innerHTML = `<li class="empty">${recsStatus}</li>`;
        return;
    }
    const target = player.playlists.get(addTargetId) ?? null;
    let html = "";
    recs.songs.forEachForward((node) => {
        const s = node.song;
        const current = node === player.currentNode;
        const art = s.artwork ? ` style="background-image:url('${escapeHtml(s.artwork)}')"` : "";
        const added = target?.has(s.id) ?? false;
        html += `<li class="card${current ? " current" : ""}" data-id="${escapeHtml(s.id)}">
            <div class="card-art"${art}>
                <button class="preview" data-action="play-result" title="Play" aria-label="Play ${escapeHtml(s.title)}">${current && player.isPlaying ? "❚❚" : "▶"}</button>
            </div>
            <strong class="title" translate="no">${escapeHtml(s.title)}</strong>
            <span class="artist" translate="no">${escapeHtml(s.artist)}</span>
            <div class="card-actions">
                ${heartButton(s)}
                <button class="btn small" data-action="add-result" ${added ? "disabled" : ""}>${added ? "Added" : "＋ Add"}</button>
            </div>
        </li>`;
    });
    $("recs").innerHTML = html;
}

function renderHeader(): void {
    const playlist = player.selectedPlaylist;
    $("playlist-title").textContent = playlist ? playlist.name : "No playlist selected";
    $("playlist-meta").textContent = playlist
        ? `${playlist.size} ${playlist.size === 1 ? "song" : "songs"} · ${formatTime(playlist.totalDuration())}`
        : "Create a playlist to start adding music.";
    $<HTMLButtonElement>("add-local").disabled = !playlist;
    $("cover").classList.toggle("liked", playlist === player.liked);
}

function renderSongs(): void {
    const playlist = player.selectedPlaylist;
    const list = $("song-list");
    if (!playlist) {
        list.innerHTML = '<li class="empty">Create a playlist in the left panel.</li>';
        return;
    }
    if (playlist.songs.isEmpty()) {
        list.innerHTML =
            playlist === player.liked
                ? '<li class="empty">No liked songs yet.<br>Press the ♡ on any song to keep it here.</li>'
                : '<li class="empty">This playlist is empty.<br>Use <b>Add Local Songs</b> or go to <b>Search</b>.</li>';
        return;
    }
    let html = "";
    const last = playlist.size - 1;
    playlist.songs.forEachForward((node, index) => {
        const s = node.song;
        const current = node === player.currentNode;
        const marker = current ? (player.isPlaying ? "▶" : "❚❚") : String(index + 1);
        html += `<li class="song${current ? " current" : ""}" draggable="true" data-index="${index}" data-id="${escapeHtml(s.id)}">
            <span class="handle" title="Drag to reorder">⠿</span>
            <span class="num">${marker}</span>
            <button class="info" data-action="play-song" title="Play">
                <span class="title" translate="no">${escapeHtml(s.title)}</span>
                <span class="artist" translate="no">${escapeHtml(s.artist)}</span>
            </button>
            <span class="badge">${sourceLabel(s)}</span>
            <span class="dur">${formatTime(s.duration)}</span>
            <span class="row-actions">
                ${heartButton(s)}
                <button data-action="move-up" title="Move up" aria-label="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
                <button data-action="move-down" title="Move down" aria-label="Move down" ${index === last ? "disabled" : ""}>↓</button>
                <button class="remove" data-action="remove-song" title="Remove" aria-label="Remove">✕</button>
            </span>
        </li>`;
    });
    list.innerHTML = html;
}

function nodeCard(node: SongNode, isHead: boolean, isTail: boolean): string {
    const current = node === player.currentNode;
    const tags =
        (isHead ? '<span class="tag">HEAD</span>' : "") +
        (isTail ? '<span class="tag">TAIL</span>' : "") +
        (current ? '<span class="tag cur">CURRENT</span>' : "");
    return `<div class="node${current ? " current" : ""}">
        <div class="tags">${tags}</div>
        <strong>${escapeHtml(node.song.title)}</strong>
        <code>prev: ${node.prev ? escapeHtml(node.prev.song.title) : "null"}</code>
        <code>next: ${node.next ? escapeHtml(node.next.song.title) : "null"}</code>
    </div>`;
}

/** Draws the real chain of nodes, walking it in the chosen direction. */
function renderStructure(): void {
    const playlist = player.selectedPlaylist;
    const box = $("structure");
    if (!playlist || playlist.songs.isEmpty()) {
        box.innerHTML = '<p class="empty">head = null · tail = null · size = 0</p>';
        return;
    }
    const list = playlist.songs;
    let html = '<span class="null">null</span>';
    const visit = (node: SongNode): void => {
        html += `<span class="link">${html.endsWith("null</span>") ? "←" : "⇄"}</span>`;
        html += nodeCard(node, node === list.head, node === list.tail);
    };
    if (direction === "forward") list.forEachForward(visit);
    else list.forEachBackward(visit);
    html += '<span class="link">→</span><span class="null">null</span>';
    box.innerHTML = html;
}

function renderSearch(): void {
    if (searchStatus) {
        $("search-results").innerHTML = `<li class="empty">${searchStatus}</li>`;
        return;
    }
    const targetPlaylist = player.playlists.get(addTargetId) ?? null;
    let html = "";
    results.songs.forEachForward((node) => {
        const s = node.song;
        const current = node === player.currentNode;
        const art = s.artwork ? `<img src="${escapeHtml(s.artwork)}" alt="" loading="lazy">` : '<span class="noart"></span>';
        const added = targetPlaylist?.has(s.id) ?? false;
        html += `<li class="song result${current ? " current" : ""}" data-id="${escapeHtml(s.id)}">
            <button class="preview" data-action="play-result" title="Listen without adding" aria-label="Listen to ${escapeHtml(s.title)}">${current && player.isPlaying ? "❚❚" : "▶"}</button>
            ${art}
            <span class="info"><span class="title" translate="no">${escapeHtml(s.title)}</span><span class="artist" translate="no">${escapeHtml(s.artist)}</span></span>
            <span class="badge${isPreview(s) ? "" : " full"}">${sourceLabel(s)}</span>
            <span class="dur">${formatTime(s.duration)}</span>
            ${heartButton(s)}
            <button class="btn small" data-action="add-result" ${added ? "disabled" : ""}>${added ? "Added" : "＋ Add"}</button>
        </li>`;
    });
    $("search-results").innerHTML = html;
}

function renderPlayerBar(): void {
    const node = player.currentNode;
    $("now-title").textContent = node ? node.song.title : "Nothing playing";
    $("now-artist").textContent = node
        ? `${node.song.artist} · ${player.playingPlaylist?.name ?? ""}`
        : "Pick a song to start";
    $("now-art").style.backgroundImage = node?.song.artwork ? `url("${node.song.artwork}")` : "";
    const play = $("btn-play");
    play.textContent = player.isPlaying ? "❚❚" : "▶";
    play.title = player.isPlaying ? "Pause" : "Play";
    play.setAttribute("aria-label", play.title);
    $("btn-repeat").classList.toggle("on", player.repeat);
    $("btn-repeat").setAttribute("aria-pressed", String(player.repeat));
    $("btn-shuffle").classList.toggle("on", player.shuffle);
    $("btn-shuffle").setAttribute("aria-pressed", String(player.shuffle));
    $("btn-shuffle").title = player.shuffle ? "Shuffle is on (click for list order)" : "Shuffle is off (playing in list order)";
    const like = $("btn-like");
    like.hidden = !node;
    if (node) {
        const liked = player.isLiked(node.song.id);
        like.textContent = liked ? "♥" : "♡";
        like.classList.toggle("on", liked);
        like.title = liked ? "Remove from Liked Songs" : "Add to Liked Songs";
        like.setAttribute("aria-label", like.title);
    }
    $("stage-title").textContent = node ? node.song.title : "";
    $("stage-artist").textContent = node ? node.song.artist : "";
    const heroPlaying = player.isPlaying && player.playingPlaylist === player.selectedPlaylist;
    $("hero-play").textContent = heroPlaying ? "❚❚" : "▶";
}

function renderProgress(): void {
    const time = player.getCurrentTime();
    const duration = player.getDuration();
    $("time-current").textContent = formatTime(time);
    $("time-total").textContent = formatTime(duration);
    if (!seeking) $<HTMLInputElement>("seek").value = duration > 0 ? String((time / duration) * 1000) : "0";
}

function render(): void {
    renderPlaylists();
    renderAddTargets();
    renderHome();
    renderHeader();
    renderSongs();
    renderStructure();
    renderSearch();
    renderPlayerBar();
}

// ---- wiring ----------------------------------------------------------------

let ready = false;
player.onChange = () => {
    render();
    if (ready) saveState(player);
};
player.onProgress = renderProgress;
player.onMessage = (message) => toast(message, true);

$("playlist-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("playlist-name");
    const result = player.createPlaylist(input.value);
    report(result, true);
    if (result.ok) {
        input.value = "";
        // Jump to the playlist that was just created.
        let lastId = "";
        for (const id of player.playlists.keys()) lastId = id;
        openPlaylist(lastId);
    }
});

$("playlist-list").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!button) return;
    const id = button.dataset.id!;
    if (button.dataset.action === "select-playlist") openPlaylist(id);
    if (button.dataset.action === "delete-playlist") {
        const playlist = player.playlists.get(id);
        playlist?.songs.forEachForward((node) => {
            if (node.song.source === "local") forgetLocalFile(node.song, id);
        });
        report(player.deletePlaylist(id), true);
        // The playlist on screen is gone: go back to Home.
        if (page === "playlist" && !player.selectedPlaylist) showPage("home");
    }
});

// Sidebar navigation, Liked Songs and the home shortcuts
document.querySelectorAll<HTMLElement>(".nav-item").forEach((item) => {
    item.addEventListener("click", () => showPage(item.dataset.page as Page));
});
$("liked-link").addEventListener("click", () => openPlaylist(LIKED_ID));
$("home-tiles").addEventListener("click", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-open]");
    if (tile) openPlaylist(tile.dataset.open!);
});
document.querySelectorAll<HTMLSelectElement>("select.add-target").forEach((select) => {
    select.addEventListener("change", () => {
        addTargetId = select.value;
        render();
    });
});

/** Deletes the stored copy of a local file once no other playlist uses it. */
function forgetLocalFile(song: Song, exceptPlaylistId: string): void {
    if (exceptPlaylistId !== LIKED_ID && player.liked.has(song.id)) return;
    for (const playlist of player.playlists.values()) {
        if (playlist.id !== exceptPlaylistId && playlist.has(song.id)) return;
    }
    void deleteFile(song.id);
}

document.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        activeTab = tab.dataset.tab!;
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        for (const name of ["songs", "structure"]) $(`view-${name}`).hidden = name !== activeTab;
    });
});

document.querySelectorAll<HTMLElement>("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
        direction = button.dataset.direction as "forward" | "backward";
        document.querySelectorAll("[data-direction]").forEach((b) => b.classList.toggle("active", b === button));
        renderStructure();
    });
});

// Local files
$("add-local").addEventListener("click", () => $<HTMLInputElement>("file-input").click());
$<HTMLInputElement>("file-input").addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const playlist = player.selectedPlaylist;
    if (!playlist || !input.files) return;
    let added = 0;
    let skipped = 0;
    for (const file of input.files) {
        const song = await songFromFile(file);
        if (song && player.addSong(playlist.id, song).ok) added++;
        else skipped++;
    }
    input.value = "";
    if (added > 0) toast(`${added} ${added === 1 ? "song" : "songs"} added${skipped ? `, ${skipped} skipped` : ""}.`);
    else if (skipped > 0) toast("No songs added: files were not playable audio or were already in the playlist.", true);
});

// Song rows: play, remove, move with buttons
$("song-list").addEventListener("click", (event) => {
    const playlist = player.selectedPlaylist;
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    const row = button?.closest<HTMLElement>(".song");
    if (!playlist || !button || !row) return;
    const index = Number(row.dataset.index);
    const songId = row.dataset.id!;
    switch (button.dataset.action) {
        case "play-song":
            report(player.playSong(playlist.id, songId));
            break;
        case "like": {
            const node = playlist.songs.find(songId);
            if (node) report(player.toggleLike(node.song), true);
            break;
        }
        case "remove-song": {
            const node = playlist.songs.find(songId);
            if (node?.song.source === "local") forgetLocalFile(node.song, playlist.id);
            report(player.removeSong(playlist.id, songId));
            break;
        }
        case "move-up":
            report(player.moveSong(playlist.id, index, index - 1));
            break;
        case "move-down":
            report(player.moveSong(playlist.id, index, index + 1));
            break;
    }
});

// Song rows: drag & drop reorder
const songList = $("song-list");
function clearDropMarks(): void {
    songList.querySelectorAll(".drop-before, .drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
}
songList.addEventListener("dragstart", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(".song");
    if (!row) return;
    dragFrom = Number(row.dataset.index);
    row.classList.add("dragging");
    event.dataTransfer?.setData("text/plain", String(dragFrom));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
});
songList.addEventListener("dragover", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(".song");
    if (!row || dragFrom < 0) return;
    event.preventDefault();
    clearDropMarks();
    const box = row.getBoundingClientRect();
    row.classList.add(event.clientY < box.top + box.height / 2 ? "drop-before" : "drop-after");
});
songList.addEventListener("drop", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(".song");
    const playlist = player.selectedPlaylist;
    if (!row || !playlist || dragFrom < 0) return;
    event.preventDefault();
    const box = row.getBoundingClientRect();
    const over = Number(row.dataset.index);
    // Slot where the song is dropped, then its final index once it is unlinked.
    let target = event.clientY < box.top + box.height / 2 ? over : over + 1;
    if (dragFrom < target) target--;
    const from = dragFrom;
    dragFrom = -1;
    report(player.moveSong(playlist.id, from, target));
});
songList.addEventListener("dragend", () => {
    dragFrom = -1;
    clearDropMarks();
    songList.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
});

// Online search
let searchToken = 0;
$("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $<HTMLInputElement>("search-input").value;
    if (query.trim() === "") {
        toast("Type an artist or a song name.", true);
        return;
    }
    const token = ++searchToken;
    searchStatus = "Searching…";
    renderSearch();
    try {
        const found = await searchSongs(query);
        if (token !== searchToken) return; // a newer search replaced this one
        // A NEW list each time: if a result from the old search is still
        // playing, its nodes stay linked and Next keeps working.
        results = new Playlist("search-results", "Search results");
        for (const song of found) results.addSong(song);
        searchStatus = found.length === 0 ? "No results found." : "";
    } catch {
        if (token !== searchToken) return;
        searchStatus = "Search is unavailable right now. Check your connection and try again.";
    }
    renderSearch();
});
/**
 * Clicks on a list of songs that are not saved yet (search results or home
 * recommendations): listen without adding, like, or add to a playlist.
 */
function handleUnsavedListClick(event: Event, list: Playlist): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    const songId = button?.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (!button || !songId) return;
    const node = list.songs.find(songId);
    if (!node) return;
    const s = node.song;
    switch (button.dataset.action) {
        case "play-result":
            // Listen without adding: play straight from this list.
            if (node === player.currentNode) report(player.togglePlay());
            else report(player.playFrom(list, songId));
            break;
        case "like":
            report(player.toggleLike(s), true);
            break;
        case "add-result":
            if (!addTargetId) {
                toast("Create a playlist first.", true);
                return;
            }
            // A copy of the data: the playlist gets its own node, this list keeps its own.
            report(player.addSong(addTargetId, new Song(s.id, s.title, s.artist, s.duration, s.url, s.source, s.artwork)), true);
            break;
    }
}
$("search-results").addEventListener("click", (event) => handleUnsavedListClick(event, results));
$("recs").addEventListener("click", (event) => handleUnsavedListClick(event, recs));

// Video size: cinema (large) or compact
$("stage-size").addEventListener("click", () => {
    setCompact(!stage.classList.contains("compact"));
    shrunkByScroll = false;
    if (!stage.classList.contains("compact")) scroller.scrollTop = 0;
});

// Big play button of the playlist on screen
$("hero-play").addEventListener("click", () => {
    const playlist = player.selectedPlaylist;
    if (!playlist) return toast("Create a playlist first.", true);
    if (player.playingPlaylist === playlist && player.currentNode) return report(player.togglePlay());
    if (!playlist.songs.head) return toast("This playlist has no songs yet.", true);
    report(player.playSong(playlist.id, playlist.songs.head.song.id));
});

$("btn-play").addEventListener("click", () => report(player.togglePlay()));
$("btn-next").addEventListener("click", () => report(player.next()));
$("btn-prev").addEventListener("click", () => report(player.previous()));
$("btn-repeat").addEventListener("click", () => {
    player.toggleRepeat();
    toast(player.repeat ? "Repeat is on." : "Repeat is off.");
});
$("btn-shuffle").addEventListener("click", () => {
    player.toggleShuffle();
    toast(player.shuffle ? "Shuffle is on: random order." : "Shuffle is off: list order.");
});
$("btn-like").addEventListener("click", () => {
    if (player.currentNode) report(player.toggleLike(player.currentNode.song), true);
});

let seeking = false;
const seek = $<HTMLInputElement>("seek");
seek.addEventListener("input", () => (seeking = true));
seek.addEventListener("change", () => {
    seeking = false;
    player.seek((Number(seek.value) / 1000) * player.getDuration());
});
$<HTMLInputElement>("volume").addEventListener("input", (event) => {
    player.setVolume(Number((event.target as HTMLInputElement).value) / 100);
});

document.addEventListener("keydown", (event) => {
    const tag = (event.target as HTMLElement).tagName;
    if (event.code === "Space" && tag !== "INPUT" && tag !== "BUTTON") {
        event.preventDefault();
        report(player.togglePlay());
    }
});

$("search-hint").textContent = hasYouTubeKey()
    ? "Press ▶ to listen without adding. Songs play in full through YouTube; independent tracks come from Audius."
    : "Press ▶ to listen without adding. No YouTube key configured: well-known songs play as 30-second previews.";

// ---- start -----------------------------------------------------------------

showPage("home");
restoreState(player)
    .catch(() => {})
    .finally(() => {
        ready = true;
        render();
    });

// Home recommendations: loaded once, in their own linked list.
getRecommendations()
    .then((found) => {
        recs = new Playlist("recommended", "Recommended");
        for (const song of found.songs) recs.addSong(song);
        $("recs-title").textContent = found.title;
        recsStatus = found.songs.length === 0 ? "No recommendations available right now." : "";
    })
    .catch(() => {
        recsStatus = "Recommendations are unavailable right now. You can still search or add your own songs.";
    })
    .finally(renderHome);
