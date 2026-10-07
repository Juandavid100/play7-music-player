import { DoublyLinkedList } from "../structures/DoublyLinkedList";
import { Song } from "./Song";
import { SongNode } from "./SongNode";

/** A named playlist. Each playlist owns its own doubly linked list. */
export class Playlist {
    id: string;
    name: string;
    songs: DoublyLinkedList;

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
        this.songs = new DoublyLinkedList();
    }

    get size(): number {
        return this.songs.size;
    }

    has(songId: string): boolean {
        return this.songs.find(songId) !== null;
    }

    /** Adds a song at the end, or at `index` when given. Rejects duplicates. */
    addSong(song: Song, index?: number): SongNode | null {
        if (this.has(song.id)) return null;
        if (index === undefined) return this.songs.addLast(song);
        return this.songs.insert(index, song);
    }

    moveSong(fromIndex: number, toIndex: number): boolean {
        return this.songs.move(fromIndex, toIndex);
    }

    /** Total duration in seconds, computed by walking the list. */
    totalDuration(): number {
        let total = 0;
        this.songs.forEachForward((node) => {
            total += node.song.duration;
        });
        return total;
    }
}
