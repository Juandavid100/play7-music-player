export type SongSource = "local" | "online";

/** Plain data describing one track. It knows nothing about lists or playback. */
export class Song {
    id: string;
    title: string;
    artist: string;
    duration: number; // seconds, 0 when unknown
    url: string;
    source: SongSource;
    artwork: string | null;

    constructor(
        id: string,
        title: string,
        artist: string,
        duration: number,
        url: string,
        source: SongSource,
        artwork: string | null = null
    ) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.duration = duration;
        this.url = url;
        this.source = source;
        this.artwork = artwork;
    }
}
