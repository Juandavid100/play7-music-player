import { SongNode } from "../src/models/SongNode";
import { Song } from "../src/models/Song";
import { DoublyLinkedList } from "../src/structures/DoublyLinkedList";
import { AudioEngine } from "../src/player/AudioEngine";

export function song(title: string): Song {
    return new Song(`id-${title}`, title, "Test Artist", 100, `http://test/${title}.mp3`, "online");
}

/** "A B C" reading the list head -> tail through `next`. */
export function forward(list: DoublyLinkedList): string {
    let text = "";
    list.forEachForward((node) => (text += (text ? " " : "") + node.song.title));
    return text;
}

/** "C B A" reading the list tail -> head through `prev`. */
export function backward(list: DoublyLinkedList): string {
    let text = "";
    list.forEachBackward((node) => (text += (text ? " " : "") + node.song.title));
    return text;
}

/** Checks that every prev/next pair, head, tail and size agree with each other. */
export function isConsistent(list: DoublyLinkedList): boolean {
    if (list.size === 0) return list.head === null && list.tail === null;
    if (!list.head || !list.tail || list.head.prev || list.tail.next) return false;
    let count = 0;
    let node: SongNode | null = list.head;
    let last: SongNode = list.head;
    while (node) {
        if (node.next && node.next.prev !== node) return false;
        last = node;
        node = node.next;
        count++;
    }
    return last === list.tail && count === list.size;
}

/** Audio engine with no sound, so playback logic can be tested in Node. */
export class FakeAudio implements AudioEngine {
    url = "";
    playing = false;
    time = 0;
    onEnded: () => void = () => {};
    onTimeUpdate: () => void = () => {};
    onError: () => void = () => {};
    load(url: string): void {
        this.url = url;
        this.time = 0;
    }
    play(): Promise<void> {
        this.playing = true;
        return Promise.resolve();
    }
    pause(): void {
        this.playing = false;
    }
    seek(seconds: number): void {
        this.time = seconds;
    }
    setVolume(): void {}
    getCurrentTime(): number {
        return this.time;
    }
    getDuration(): number {
        return 100;
    }
    /** Simulates the current song reaching its end. */
    finish(): void {
        this.onEnded();
    }
}
