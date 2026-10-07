/** Minimal audio contract so MusicPlayer can be tested without a browser. */
export interface AudioEngine {
    load(url: string): void;
    play(): Promise<void>;
    pause(): void;
    seek(seconds: number): void;
    setVolume(volume: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    onEnded: () => void;
    onTimeUpdate: () => void;
    onError: () => void;
}

/** Real implementation backed by an HTMLAudioElement. */
export class BrowserAudioEngine implements AudioEngine {
    private audio = new Audio();
    onEnded: () => void = () => {};
    onTimeUpdate: () => void = () => {};
    onError: () => void = () => {};

    constructor() {
        this.audio.preload = "metadata";
        this.audio.addEventListener("ended", () => this.onEnded());
        this.audio.addEventListener("timeupdate", () => this.onTimeUpdate());
        this.audio.addEventListener("loadedmetadata", () => this.onTimeUpdate());
        this.audio.addEventListener("error", () => {
            if (this.audio.getAttribute("src")) this.onError();
        });
    }

    load(url: string): void {
        this.audio.src = url;
        this.audio.load();
    }

    play(): Promise<void> {
        return this.audio.play();
    }

    pause(): void {
        this.audio.pause();
    }

    seek(seconds: number): void {
        if (Number.isFinite(seconds)) this.audio.currentTime = seconds;
    }

    setVolume(volume: number): void {
        this.audio.volume = Math.min(1, Math.max(0, volume));
    }

    getCurrentTime(): number {
        return this.audio.currentTime || 0;
    }

    getDuration(): number {
        return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    }
}
