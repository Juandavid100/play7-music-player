import { Playlist } from "../models/Playlist";
import { Song } from "../models/Song";
import { SongNode } from "../models/SongNode";
import { AudioEngine } from "./AudioEngine";

export interface ActionResult {
    ok: boolean;
    message: string;
}

const ok = (message = ""): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

/**
 * Application state and playback logic.
 *
 * The player never keeps an index of the current song. It keeps a reference
 * to the current NODE, and Next / Previous simply follow `next` / `prev`.
 * That is why reordering, inserting or removing songs during playback can
 * never desynchronise what is playing from what the list says.
 */
export class MusicPlayer {
    /** Playlists by id (the songs themselves live in each playlist's linked list). */
    playlists = new Map<string, Playlist>();
    /** Playlist shown on screen. */
    selectedPlaylist: Playlist | null = null;
    /** Playlist that owns the node being played (may differ from the selected one). */
    playingPlaylist: Playlist | null = null;
    currentNode: SongNode | null = null;
    isPlaying = false;
    repeat = false;
    volume = 0.8;

    onChange: () => void = () => {};
    onProgress: () => void = () => {};
    onMessage: (message: string) => void = () => {};

    private idCounter = 0;
    /** Songs in a row that failed to play; stops an endless chain of skips. */
    private failedInARow = 0;

    constructor(private audio: AudioEngine) {
        audio.setVolume(this.volume);
        audio.onEnded = () => this.handleEnded();
        audio.onTimeUpdate = () => this.onProgress();
        audio.onError = () => this.handleError();
    }

    // ---- playlists -------------------------------------------------------

    createPlaylist(name: string, id?: string): ActionResult {
        const clean = name.trim();
        if (clean === "") return fail("Playlist name cannot be empty.");
        if (clean.length > 40) return fail("Playlist name is too long (max 40).");
        for (const playlist of this.playlists.values()) {
            if (playlist.name.toLowerCase() === clean.toLowerCase()) {
                return fail(`A playlist named "${playlist.name}" already exists.`);
            }
        }
        const playlistId = id ?? `pl-${Date.now()}-${this.idCounter++}`;
        const playlist = new Playlist(playlistId, clean);
        this.playlists.set(playlistId, playlist);
        if (!this.selectedPlaylist) this.selectedPlaylist = playlist;
        this.onChange();
        return ok(`Playlist "${clean}" created.`);
    }

    deletePlaylist(playlistId: string): ActionResult {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return fail("Playlist not found.");
        if (this.playingPlaylist === playlist) this.stop();
        playlist.songs.clear();
        this.playlists.delete(playlistId);
        if (this.selectedPlaylist === playlist) {
            const first = this.playlists.values().next();
            this.selectedPlaylist = first.done ? null : first.value;
        }
        this.onChange();
        return ok(`Playlist "${playlist.name}" deleted.`);
    }

    /** Changes the playlist on screen. Playback of another playlist continues. */
    selectPlaylist(playlistId: string): ActionResult {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return fail("Playlist not found.");
        this.selectedPlaylist = playlist;
        this.onChange();
        return ok();
    }

    // ---- songs -----------------------------------------------------------

    addSong(playlistId: string, song: Song, index?: number): ActionResult {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return fail("Create or select a playlist first.");
        if (playlist.has(song.id)) return fail(`"${song.title}" is already in "${playlist.name}".`);
        const node = playlist.addSong(song, index);
        if (!node) return fail("Invalid position.");
        this.onChange();
        return ok(`"${song.title}" added to "${playlist.name}".`);
    }

    removeSong(playlistId: string, songId: string): ActionResult {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return fail("Playlist not found.");
        const node = playlist.songs.find(songId);
        if (!node) return fail("Song not found.");

        if (node === this.currentNode) {
            // Decide the successor BEFORE unlinking: removal clears node.next/prev.
            const successor = node.next ?? node.prev;
            const wasPlaying = this.isPlaying;
            playlist.songs.remove(node);
            if (successor) {
                this.setCurrent(playlist, successor);
                if (wasPlaying) this.startAudio();
            } else {
                this.stop();
            }
        } else {
            playlist.songs.remove(node);
        }
        this.onChange();
        return ok(`"${node.song.title}" removed.`);
    }

    moveSong(playlistId: string, fromIndex: number, toIndex: number): ActionResult {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return fail("Playlist not found.");
        if (!playlist.moveSong(fromIndex, toIndex)) return fail("Invalid move.");
        // Nothing else to fix: currentNode is the same object, only its links changed.
        this.onChange();
        return ok();
    }

    // ---- playback --------------------------------------------------------

    playSong(playlistId: string, songId: string): ActionResult {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return fail("Playlist not found.");
        return this.playFrom(playlist, songId);
    }

    /**
     * Plays a song from any list of songs, saved or not. This is how search
     * results are heard without adding them to a playlist: the results live in
     * their own temporary linked list, so Next and Previous also work on them.
     */
    playFrom(playlist: Playlist, songId: string): ActionResult {
        this.userAction();
        const node = playlist.songs.find(songId);
        if (!node) return fail("Song not found.");
        this.setCurrent(playlist, node);
        this.startAudio();
        return ok();
    }

    togglePlay(): ActionResult {
        this.userAction();
        if (!this.currentNode) {
            const playlist = this.selectedPlaylist;
            if (!playlist || !playlist.songs.head) return fail("This playlist has no songs yet.");
            this.setCurrent(playlist, playlist.songs.head);
            this.startAudio();
            return ok();
        }
        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
            this.onChange();
        } else {
            this.startAudio(false);
        }
        return ok();
    }

    next(): ActionResult {
        this.userAction();
        if (!this.currentNode || !this.playingPlaylist) return fail("Nothing is playing.");
        let target = this.currentNode.next;
        if (!target && this.repeat) target = this.playingPlaylist.songs.head;
        if (!target) return fail("This is the last song.");
        this.setCurrent(this.playingPlaylist, target);
        this.startAudio();
        return ok();
    }

    previous(): ActionResult {
        this.userAction();
        if (!this.currentNode || !this.playingPlaylist) return fail("Nothing is playing.");
        // Like most players: past 3 seconds, Previous restarts the current song.
        if (this.audio.getCurrentTime() > 3) {
            this.audio.seek(0);
            this.onProgress();
            return ok();
        }
        let target = this.currentNode.prev;
        if (!target && this.repeat) target = this.playingPlaylist.songs.tail;
        if (!target) {
            this.audio.seek(0);
            this.onProgress();
            return fail("This is the first song.");
        }
        this.setCurrent(this.playingPlaylist, target);
        this.startAudio();
        return ok();
    }

    seek(seconds: number): void {
        if (this.currentNode) this.audio.seek(seconds);
    }

    setVolume(volume: number): void {
        this.volume = Math.min(1, Math.max(0, volume));
        this.audio.setVolume(this.volume);
    }

    toggleRepeat(): void {
        this.repeat = !this.repeat;
        this.onChange();
    }

    getCurrentTime(): number {
        return this.currentNode ? this.audio.getCurrentTime() : 0;
    }

    getDuration(): number {
        if (!this.currentNode) return 0;
        return this.audio.getDuration() || this.currentNode.song.duration;
    }

    stop(): void {
        this.audio.pause();
        this.audio.load("");
        this.currentNode = null;
        this.playingPlaylist = null;
        this.isPlaying = false;
        this.onChange();
        this.onProgress();
    }

    // ---- internals -------------------------------------------------------

    private setCurrent(playlist: Playlist, node: SongNode): void {
        this.playingPlaylist = playlist;
        this.currentNode = node;
        this.audio.load(node.song.url);
    }

    private startAudio(announce = true): void {
        this.isPlaying = true;
        this.onChange();
        const node = this.currentNode;
        this.audio.play().catch(() => {
            // Ignore rejections from a song that is no longer the current one.
            if (this.currentNode !== node) return;
            this.isPlaying = false;
            this.onChange();
            if (announce) this.onMessage("Playback could not start. Press Play to try again.");
        });
    }

    /** The current song finished: follow `next` from the CURRENT node. */
    private handleEnded(): void {
        if (!this.currentNode || !this.playingPlaylist) return;
        let target = this.currentNode.next;
        if (!target && this.repeat) target = this.playingPlaylist.songs.head;
        if (target) {
            this.setCurrent(this.playingPlaylist, target);
            this.startAudio();
        } else {
            this.isPlaying = false;
            this.onChange();
        }
    }

    /**
     * The current song cannot be played (for example a video that does not
     * allow embedding): tell the user and skip to the next one.
     */
    private handleError(): void {
        if (!this.currentNode || !this.playingPlaylist) return;
        const failed = this.currentNode;
        this.failedInARow++;
        this.onMessage(`"${failed.song.title}" could not be played.`);
        if (this.isPlaying && failed.next && this.failedInARow < 5) {
            this.setCurrent(this.playingPlaylist, failed.next);
            this.startAudio();
            return;
        }
        this.isPlaying = false;
        this.onChange();
    }

    /** Called when the user starts something on purpose. */
    private userAction(): void {
        this.failedInARow = 0;
    }
}
