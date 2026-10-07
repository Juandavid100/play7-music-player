import { Song } from "./Song";

/** One node of the doubly linked list: a song plus links to its neighbours. */
export class SongNode {
    song: Song;
    prev: SongNode | null;
    next: SongNode | null;

    constructor(song: Song) {
        this.song = song;
        this.prev = null;
        this.next = null;
    }
}
