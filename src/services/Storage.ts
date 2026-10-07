import { Song } from "../models/Song";
import { Playlist } from "../models/Playlist";
import { LIKED_ID, MusicPlayer } from "../player/MusicPlayer";
import { loadFile } from "./LocalFiles";

const KEY = "play7-state-v1";

interface SavedSong {
    id: string;
    title: string;
    artist: string;
    duration: number;
    url: string;
    source: "local" | "online";
    artwork: string | null;
}

interface SavedPlaylist {
    id: string;
    name: string;
    songs: SavedSong[];
}

function serialize(playlist: Playlist): SavedPlaylist {
    const songs: SavedSong[] = new Array(playlist.size);
    playlist.songs.forEachForward((node, index) => {
        const s = node.song;
        songs[index] = {
            id: s.id,
            title: s.title,
            artist: s.artist,
            duration: s.duration,
            url: s.source === "local" ? "" : s.url, // blob URLs die with the page
            source: s.source,
            artwork: s.artwork,
        };
    });
    return { id: playlist.id, name: playlist.name, songs };
}

/** Writes Liked Songs and every playlist to localStorage, walking each list head -> tail. */
export function saveState(player: MusicPlayer): void {
    const saved: SavedPlaylist[] = new Array(player.playlists.size + 1);
    let p = 0;
    saved[p++] = serialize(player.liked);
    for (const playlist of player.playlists.values()) saved[p++] = serialize(playlist);
    try {
        localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
        /* storage unavailable: the app keeps working without persistence */
    }
}

/** Rebuilds the lists (and their linked lists) saved in a previous visit. */
export async function restoreState(player: MusicPlayer): Promise<void> {
    let saved: SavedPlaylist[] = [];
    try {
        saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedPlaylist[];
    } catch {
        return;
    }
    if (!Array.isArray(saved)) return;
    for (const item of saved) {
        if (item.id !== LIKED_ID && !player.createPlaylist(item.name, item.id).ok) continue;
        for (const s of item.songs ?? []) {
            let url = s.url;
            if (s.source === "local") {
                const blob = await loadFile(s.id).catch(() => null);
                if (!blob) continue; // file no longer available in this browser
                url = URL.createObjectURL(blob);
            }
            player.addSong(item.id, new Song(s.id, s.title, s.artist, s.duration, url, s.source, s.artwork));
        }
    }
}
