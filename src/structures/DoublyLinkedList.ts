import { Song } from "../models/Song";
import { SongNode } from "../models/SongNode";

/**
 * Hand-written doubly linked list of songs.
 *
 * No built-in collection stores the songs: the only storage is the chain of
 * SongNode objects connected through `prev` and `next`.
 */
export class DoublyLinkedList {
    head: SongNode | null;
    tail: SongNode | null;
    size: number;

    constructor() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }

    isEmpty(): boolean {
        return this.size === 0;
    }

    /** Inserts a song at the beginning. O(1) */
    addFirst(song: Song): SongNode {
        const node = new SongNode(song);
        this.attachAt(node, 0);
        return node;
    }

    /** Inserts a song at the end. O(1) */
    addLast(song: Song): SongNode {
        const node = new SongNode(song);
        this.attachAt(node, this.size);
        return node;
    }

    /** Inserts a song at `index` (0..size). Returns null if the index is invalid. */
    insert(index: number, song: Song): SongNode | null {
        if (!Number.isInteger(index) || index < 0 || index > this.size) return null;
        const node = new SongNode(song);
        this.attachAt(node, index);
        return node;
    }

    /** Returns the node at `index`, walking from the nearest end. O(n/2) */
    getAt(index: number): SongNode | null {
        if (!Number.isInteger(index) || index < 0 || index >= this.size) return null;
        let node: SongNode | null;
        if (index < this.size / 2) {
            node = this.head;
            for (let i = 0; i < index && node; i++) node = node.next;
        } else {
            node = this.tail;
            for (let i = this.size - 1; i > index && node; i--) node = node.prev;
        }
        return node;
    }

    /** Finds the node holding the song with the given id. O(n) */
    find(songId: string): SongNode | null {
        let node = this.head;
        while (node) {
            if (node.song.id === songId) return node;
            node = node.next;
        }
        return null;
    }

    /** Position of a node in the list, or -1 if it does not belong to it. O(n) */
    indexOf(target: SongNode): number {
        let node = this.head;
        let index = 0;
        while (node) {
            if (node === target) return index;
            node = node.next;
            index++;
        }
        return -1;
    }

    /** Unlinks a node from the list. Returns false if the node is not in it. */
    remove(node: SongNode): boolean {
        if (this.indexOf(node) === -1) return false;
        this.detach(node);
        return true;
    }

    /** Removes the node at `index` and returns its song. */
    removeAt(index: number): Song | null {
        const node = this.getAt(index);
        if (!node) return null;
        this.detach(node);
        return node.song;
    }

    /**
     * Moves the node at `fromIndex` so that it ends up at `toIndex`.
     * The SAME node object is re-linked (never recreated), so any outside
     * reference to it (for example the song currently playing) stays valid.
     */
    move(fromIndex: number, toIndex: number): boolean {
        const node = this.getAt(fromIndex);
        if (!node) return false;
        if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= this.size) return false;
        if (fromIndex === toIndex) return true;
        this.detach(node);
        this.attachAt(node, toIndex);
        return true;
    }

    /** Visits every song from head to tail following `next`. */
    forEachForward(visit: (node: SongNode, index: number) => void): void {
        let node = this.head;
        let index = 0;
        while (node) {
            const following = node.next; // read first: visit may relink the node
            visit(node, index);
            node = following;
            index++;
        }
    }

    /** Visits every song from tail to head following `prev`. */
    forEachBackward(visit: (node: SongNode, index: number) => void): void {
        let node = this.tail;
        let index = this.size - 1;
        while (node) {
            const preceding = node.prev;
            visit(node, index);
            node = preceding;
            index--;
        }
    }

    clear(): void {
        // Break every link so removed nodes cannot leak into playback.
        let node = this.head;
        while (node) {
            const following = node.next;
            node.prev = null;
            node.next = null;
            node = following;
        }
        this.head = null;
        this.tail = null;
        this.size = 0;
    }

    // ---- private link surgery -------------------------------------------

    /** Links a free node so that it becomes position `index` (0..size). */
    private attachAt(node: SongNode, index: number): void {
        if (this.size === 0) {
            node.prev = null;
            node.next = null;
            this.head = node;
            this.tail = node;
        } else if (index === 0) {
            node.prev = null;
            node.next = this.head;
            this.head!.prev = node;
            this.head = node;
        } else if (index === this.size) {
            node.next = null;
            node.prev = this.tail;
            this.tail!.next = node;
            this.tail = node;
        } else {
            const after = this.getAt(index)!; // node currently at that position
            const before = after.prev!;
            node.prev = before;
            node.next = after;
            before.next = node;
            after.prev = node;
        }
        this.size++;
    }

    /** Unlinks a node that belongs to this list and clears its own links. */
    private detach(node: SongNode): void {
        if (node.prev) node.prev.next = node.next;
        else this.head = node.next;

        if (node.next) node.next.prev = node.prev;
        else this.tail = node.prev;

        node.prev = null;
        node.next = null;
        this.size--;
    }
}
