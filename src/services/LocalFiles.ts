import { Song } from "../models/Song";

const DB_NAME = "play7-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Keeps a copy of the chosen file in the browser so it survives a reload. */
export async function saveFile(songId: string, file: Blob): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(file, songId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

export async function loadFile(songId: string): Promise<Blob | null> {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
        const request = db.transaction(STORE).objectStore(STORE).get(songId);
        request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
        request.onerror = () => reject(request.error);
    });
    db.close();
    return blob;
}

export async function deleteFile(songId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(songId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
    db.close();
}

function readDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? probe.duration : 0);
        probe.onerror = () => resolve(-1);
        probe.src = url;
    });
}

/** "Artist - Title.mp3" -> { artist, title }. Falls back to the file name. */
function parseName(fileName: string): { title: string; artist: string } {
    const base = fileName.replace(/\.[^.]+$/, "");
    const dash = base.indexOf(" - ");
    if (dash > 0) return { artist: base.slice(0, dash).trim(), title: base.slice(dash + 3).trim() };
    return { title: base, artist: "Local file" };
}

/** Turns a file picked from the computer into a Song. Null if it is not playable audio. */
export async function songFromFile(file: File): Promise<Song | null> {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)) return null;
    const url = URL.createObjectURL(file);
    const duration = await readDuration(url);
    if (duration < 0) {
        URL.revokeObjectURL(url);
        return null;
    }
    const { title, artist } = parseName(file.name);
    // Same file -> same id, so adding it twice to one playlist is detected.
    const id = `local-${file.name}-${file.size}`;
    try {
        await saveFile(id, file);
    } catch {
        /* storage full or blocked: the song still works for this session */
    }
    return new Song(id, title, artist, duration, url, "local");
}
