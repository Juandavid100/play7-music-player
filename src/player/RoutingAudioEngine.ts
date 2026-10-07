import { AudioEngine } from "./AudioEngine";

const YOUTUBE_PREFIX = "youtube:";

export function youtubeUrl(videoId: string): string {
    return YOUTUBE_PREFIX + videoId;
}

/**
 * One AudioEngine made of two: normal audio (local files, direct streams) and
 * YouTube. Each song's URL decides which one plays it, and only the engine in
 * use is allowed to report events, so a silent engine can never move the playlist.
 */
export class RoutingAudioEngine implements AudioEngine {
    onEnded: () => void = () => {};
    onTimeUpdate: () => void = () => {};
    onError: () => void = () => {};
    /** Tells the page whether the YouTube video must be visible. */
    onYouTubeActive: (active: boolean) => void = () => {};

    private active: AudioEngine;

    constructor(private audio: AudioEngine, private youtube: AudioEngine) {
        this.active = audio;
        for (const engine of [audio, youtube]) {
            engine.onEnded = () => engine === this.active && this.onEnded();
            engine.onTimeUpdate = () => engine === this.active && this.onTimeUpdate();
            engine.onError = () => engine === this.active && this.onError();
        }
    }

    load(url: string): void {
        const isYouTube = url.startsWith(YOUTUBE_PREFIX);
        const next = isYouTube ? this.youtube : this.audio;
        const other = isYouTube ? this.audio : this.youtube;
        other.pause();
        other.load("");
        this.active = next;
        next.load(isYouTube ? url.slice(YOUTUBE_PREFIX.length) : url);
        this.onYouTubeActive(isYouTube);
    }

    play(): Promise<void> {
        return this.active.play();
    }
    pause(): void {
        this.active.pause();
    }
    seek(seconds: number): void {
        this.active.seek(seconds);
    }
    setVolume(volume: number): void {
        this.audio.setVolume(volume);
        this.youtube.setVolume(volume);
    }
    getCurrentTime(): number {
        return this.active.getCurrentTime();
    }
    getDuration(): number {
        return this.active.getDuration();
    }
}
