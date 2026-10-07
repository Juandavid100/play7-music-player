import { YOUTUBE_API_KEY } from "../config";
import { Song } from "../models/Song";
import { youtubeUrl } from "../player/RoutingAudioEngine";

/**
 * Internet search. Public sources are combined:
 *
 *  - YouTube (when an API key is configured): almost any song, played in
 *    full through YouTube's official embedded player.
 *  - iTunes Search API: used only when there is no YouTube key. It offers
 *    just the official 30-second preview of each song.
 *  - Audius: an open music platform where independent artists upload
 *    their tracks, which can be streamed in full.
 *
 * The APIs only provide song data and an audio URL: playlists, ordering and
 * playback logic are all ours.
 */
const AUDIUS = "https://api.audius.co/v1";
const ITUNES = "https://itunes.apple.com/search";
const YOUTUBE = "https://www.googleapis.com/youtube/v3";
const APP_NAME = "play7";
export const PREVIEW_SECONDS = 30;

export function hasYouTubeKey(): boolean {
    return YOUTUBE_API_KEY.trim() !== "";
}

export function isYouTube(song: Song): boolean {
    return song.id.startsWith("yt-");
}

/** True when the song is a 30-second preview and not the full track. */
export function isPreview(song: Song): boolean {
    return song.id.startsWith("itunes-");
}

interface AudiusTrack {
    id: string;
    title: string;
    duration: number;
    is_streamable?: boolean;
    user?: { name?: string };
    artwork?: Record<string, string> | null;
}

interface ItunesTrack {
    trackId?: number;
    trackName?: string;
    artistName?: string;
    previewUrl?: string;
    artworkUrl100?: string;
}

async function searchAudius(query: string): Promise<Song[]> {
    const url = `${AUDIUS}/tracks/search?query=${encodeURIComponent(query)}&limit=30&app_name=${APP_NAME}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audius search failed (${response.status})`);
    const body = (await response.json()) as { data?: AudiusTrack[] };
    return (body.data ?? [])
        .filter((track) => track.is_streamable !== false)
        .map(
            (track) =>
                new Song(
                    `online-${track.id}`,
                    track.title,
                    track.user?.name ?? "Unknown artist",
                    track.duration ?? 0,
                    `${AUDIUS}/tracks/${track.id}/stream?app_name=${APP_NAME}`,
                    "online",
                    track.artwork?.["150x150"] ?? null
                )
        );
}

/** Loads a JSON API through a <script> tag, for when a direct request is blocked. */
function jsonp<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const name = `play7Jsonp${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        const script = document.createElement("script");
        const scope = window as unknown as Record<string, unknown>;
        const cleanup = (): void => {
            delete scope[name];
            script.remove();
            window.clearTimeout(timer);
        };
        const timer = window.setTimeout(() => {
            cleanup();
            reject(new Error("Search timed out"));
        }, 10000);
        scope[name] = (data: T) => {
            cleanup();
            resolve(data);
        };
        script.onerror = () => {
            cleanup();
            reject(new Error("Search failed"));
        };
        script.src = `${url}&callback=${name}`;
        document.head.appendChild(script);
    });
}

async function searchItunes(query: string): Promise<Song[]> {
    const url = `${ITUNES}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=30`;
    let body: { results?: ItunesTrack[] };
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`iTunes search failed (${response.status})`);
        body = (await response.json()) as { results?: ItunesTrack[] };
    } catch {
        body = await jsonp<{ results?: ItunesTrack[] }>(url);
    }
    return (body.results ?? [])
        .filter((track) => track.trackId && track.trackName && track.previewUrl)
        .map(
            (track) =>
                new Song(
                    `itunes-${track.trackId}`,
                    track.trackName!,
                    track.artistName ?? "Unknown artist",
                    PREVIEW_SECONDS,
                    track.previewUrl!,
                    "online",
                    track.artworkUrl100 ?? null
                )
        );
}

interface YouTubeSearchItem {
    id?: { videoId?: string };
    snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
}
interface YouTubeVideoItem {
    id?: string;
    contentDetails?: { duration?: string };
}

/** "PT1H2M3S" (ISO 8601, as YouTube reports it) -> seconds. */
export function parseIsoDuration(text: string): number {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text);
    if (!match) return 0;
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/** YouTube titles arrive with HTML entities such as &amp; or &#39;. */
function decodeEntities(text: string): string {
    const area = document.createElement("textarea");
    area.innerHTML = text;
    return area.value;
}

async function searchYouTube(query: string): Promise<Song[]> {
    const key = encodeURIComponent(YOUTUBE_API_KEY.trim());
    // Music videos only, and only those that allow playing outside youtube.com.
    const searchUrl =
        `${YOUTUBE}/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true` +
        `&maxResults=25&q=${encodeURIComponent(query)}&key=${key}`;
    const response = await fetch(searchUrl);
    if (!response.ok) throw new Error(`YouTube search failed (${response.status})`);
    const body = (await response.json()) as { items?: YouTubeSearchItem[] };
    const items = (body.items ?? []).filter((item) => item.id?.videoId);
    if (items.length === 0) return [];

    // The search does not include durations: ask for them in one extra request.
    const durations = new Map<string, number>();
    try {
        const ids = items.map((item) => item.id!.videoId!).join(",");
        const details = await fetch(`${YOUTUBE}/videos?part=contentDetails&id=${ids}&key=${key}`);
        if (details.ok) {
            const data = (await details.json()) as { items?: YouTubeVideoItem[] };
            for (const video of data.items ?? []) {
                if (video.id) durations.set(video.id, parseIsoDuration(video.contentDetails?.duration ?? ""));
            }
        }
    } catch {
        /* durations are optional: the player reports the real one when it plays */
    }

    return items.map((item) => {
        const videoId = item.id!.videoId!;
        const snippet = item.snippet ?? {};
        return new Song(
            `yt-${videoId}`,
            decodeEntities(snippet.title ?? "Untitled"),
            decodeEntities(snippet.channelTitle ?? "YouTube"),
            durations.get(videoId) ?? 0,
            youtubeUrl(videoId),
            "online",
            snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null
        );
    });
}

/**
 * Searches the sources at once: YouTube + Audius when a YouTube key is set,
 * otherwise iTunes previews + Audius. If one source fails the others still
 * answer; it only throws when all of them are unavailable.
 */
export async function searchSongs(query: string): Promise<Song[]> {
    const clean = query.trim();
    if (clean === "") return [];
    const main = hasYouTubeKey() ? searchYouTube(clean) : searchItunes(clean);
    const [known, open] = await Promise.allSettled([main, searchAudius(clean)]);
    if (known.status === "rejected" && open.status === "rejected") throw new Error("Search unavailable");
    const first = known.status === "fulfilled" ? known.value : [];
    const second = open.status === "fulfilled" ? open.value : [];
    return first.concat(second);
}
