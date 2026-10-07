import { AudioEngine } from "./AudioEngine";

// Minimal typing of the parts of YouTube's IFrame Player API that we use.
interface YTPlayer {
    loadVideoById(videoId: string): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    getCurrentTime(): number;
    getDuration(): number;
}
interface YTNamespace {
    Player: new (
        element: HTMLElement,
        options: {
            width: string;
            height: string;
            playerVars: Record<string, string | number>;
            events: {
                onReady: () => void;
                onStateChange: (event: { data: number }) => void;
                onError: (event: { data: number }) => void;
            };
        }
    ) => YTPlayer;
}
declare global {
    interface Window {
        YT?: YTNamespace;
        onYouTubeIframeAPIReady?: () => void;
    }
}

const ENDED = 0;
const PLAYING = 1;

/**
 * Plays full songs through YouTube's official embedded player.
 * It follows the same AudioEngine contract as normal audio files, so
 * MusicPlayer does not know (or care) where the sound comes from.
 */
export class YouTubeEngine implements AudioEngine {
    onEnded: () => void = () => {};
    onTimeUpdate: () => void = () => {};
    onError: () => void = () => {};

    private player: YTPlayer | null = null;
    private ready = false;
    private loading = false;
    private videoId = "";
    private wantPlay = false;
    /** True while the chosen video has not been handed to YouTube to play yet. */
    private needsLoad = false;
    private volume = 80;
    private ticker = 0;

    /** `host` is the element on the page where the video is shown. */
    constructor(private host: HTMLElement) {}

    load(videoId: string): void {
        this.videoId = videoId;
        this.wantPlay = false;
        this.needsLoad = videoId !== "";
        if (videoId === "") {
            if (this.ready) this.player!.stopVideo();
            return;
        }
        this.ensurePlayer();
        // Nothing is sent to YouTube yet: play() loads and starts the video in one
        // step. Cueing first and asking to play right after makes YouTube ignore
        // the play request, leaving the video waiting for a click.
    }

    play(): Promise<void> {
        this.wantPlay = true;
        if (this.ready && this.videoId) {
            if (this.needsLoad) {
                this.needsLoad = false;
                this.player!.loadVideoById(this.videoId); // loads and starts playing
            } else {
                this.player!.playVideo(); // resume after a pause
            }
        }
        return Promise.resolve();
    }

    pause(): void {
        this.wantPlay = false;
        if (this.ready && !this.needsLoad) this.player!.pauseVideo();
    }

    seek(seconds: number): void {
        if (this.ready && Number.isFinite(seconds)) this.player!.seekTo(seconds, true);
    }

    setVolume(volume: number): void {
        this.volume = Math.round(Math.min(1, Math.max(0, volume)) * 100);
        if (this.ready) this.player!.setVolume(this.volume);
    }

    getCurrentTime(): number {
        return this.ready ? this.player!.getCurrentTime() || 0 : 0;
    }

    getDuration(): number {
        return this.ready ? this.player!.getDuration() || 0 : 0;
    }

    /** Downloads YouTube's player script the first time a YouTube song is used. */
    private ensurePlayer(): void {
        if (this.player || this.loading) return;
        this.loading = true;
        const create = (): void => {
            const slot = document.createElement("div");
            this.host.appendChild(slot);
            this.player = new window.YT!.Player(slot, {
                width: "100%",
                height: "100%",
                playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
                events: {
                    onReady: () => this.handleReady(),
                    onStateChange: (event) => this.handleState(event.data),
                    onError: () => {
                        this.wantPlay = false;
                        this.onError();
                    },
                },
            });
        };
        if (window.YT?.Player) {
            create();
            return;
        }
        window.onYouTubeIframeAPIReady = create;
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = () => {
            this.loading = false;
            this.onError();
        };
        document.head.appendChild(script);
    }

    private handleReady(): void {
        this.ready = true;
        this.player!.setVolume(this.volume);
        // Apply whatever was requested while the player was still loading.
        if (this.videoId && this.wantPlay) {
            this.needsLoad = false;
            this.player!.loadVideoById(this.videoId);
        }
    }

    private handleState(state: number): void {
        window.clearInterval(this.ticker);
        if (state === PLAYING) {
            // YouTube has no "time update" event, so progress is polled while playing.
            this.ticker = window.setInterval(() => this.onTimeUpdate(), 500);
        }
        if (state === ENDED) this.onEnded();
        this.onTimeUpdate();
    }
}
