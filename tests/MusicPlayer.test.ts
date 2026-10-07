import { test } from "node:test";
import assert from "node:assert/strict";
import { Playlist } from "../src/models/Playlist";
import { LIKED_ID, MusicPlayer } from "../src/player/MusicPlayer";
import { FakeAudio, forward, song } from "./helpers";

function setup(titles = "S1 S2 S3") {
    const audio = new FakeAudio();
    const player = new MusicPlayer(audio);
    player.createPlaylist("Rock", "rock");
    for (const title of titles.split(" ").filter(Boolean)) player.addSong("rock", song(title));
    const current = () => player.currentNode?.song.title ?? null;
    return { audio, player, current };
}

test("playlists: create, reject empty and duplicate names, delete", () => {
    const { player } = setup();
    assert.equal(player.createPlaylist("   ").ok, false);
    assert.equal(player.createPlaylist("rock").ok, false);
    assert.equal(player.createPlaylist("Vallenato", "val").ok, true);
    assert.equal(player.playlists.size, 2);
    assert.equal(player.deletePlaylist("val").ok, true);
    assert.equal(player.deletePlaylist("nope").ok, false);
});

test("empty playlist: play, next and previous do not crash", () => {
    const { player, current } = setup("");
    assert.equal(player.togglePlay().ok, false);
    assert.equal(player.next().ok, false);
    assert.equal(player.previous().ok, false);
    assert.equal(current(), null);
    assert.equal(player.isPlaying, false);
});

test("play starts at head; pause and resume keep the song", () => {
    const { player, audio, current } = setup();
    player.togglePlay();
    assert.equal(current(), "S1");
    assert.ok(audio.playing);
    player.togglePlay();
    assert.equal(player.isPlaying, false);
    player.togglePlay();
    assert.equal(current(), "S1");
    assert.ok(player.isPlaying);
});

test("next and previous follow the links", () => {
    const { player, current } = setup();
    player.togglePlay();
    player.next();
    assert.equal(current(), "S2");
    player.next();
    assert.equal(current(), "S3");
    player.previous();
    assert.equal(current(), "S2");
});

test("next on the last song and previous on the first stay put", () => {
    const { player, current } = setup();
    player.playSong("rock", "id-S3");
    assert.equal(player.next().ok, false);
    assert.equal(current(), "S3");
    player.playSong("rock", "id-S1");
    assert.equal(player.previous().ok, false);
    assert.equal(current(), "S1");
});

test("single song: next and previous stay on it; ending stops playback", () => {
    const { player, audio, current } = setup("Only");
    player.togglePlay();
    player.next();
    player.previous();
    assert.equal(current(), "Only");
    audio.finish();
    assert.equal(player.isPlaying, false);
    assert.equal(current(), "Only");
});

test("repeat wraps from tail to head", () => {
    const { player, audio, current } = setup();
    player.toggleRepeat();
    player.playSong("rock", "id-S3");
    audio.finish();
    assert.equal(current(), "S1");
    player.previous();
    assert.equal(current(), "S3");
});

test("professor's case: reorder around the playing song, then it ends", () => {
    const { player, audio, current } = setup();
    player.playSong("rock", "id-S1"); // S1 playing: S1 S2 S3
    player.moveSong("rock", 1, 0); // S2 dragged above it: S2 S1 S3
    assert.equal(forward(player.playingPlaylist!.songs), "S2 S1 S3");
    assert.equal(current(), "S1"); // still the same song, uninterrupted
    audio.finish();
    assert.equal(current(), "S3"); // what the screen shows after S1
});

test("moving the current song: playback continues from its new place", () => {
    const { player, audio, current } = setup();
    player.playSong("rock", "id-S1");
    player.moveSong("rock", 0, 2); // S2 S3 S1
    assert.equal(current(), "S1");
    assert.equal(player.next().ok, false); // S1 is now last
    player.moveSong("rock", 2, 1); // S2 S1 S3
    audio.finish();
    assert.equal(current(), "S3");
});

test("moving the next song changes what plays next", () => {
    const { player, audio, current } = setup("S1 S2 S3 S4");
    player.playSong("rock", "id-S1");
    player.moveSong("rock", 1, 3); // S1 S3 S4 S2
    audio.finish();
    assert.equal(current(), "S3");
});

test("removing the current song jumps to its successor and keeps playing", () => {
    const { player, audio, current } = setup();
    player.playSong("rock", "id-S2");
    player.removeSong("rock", "id-S2");
    assert.equal(current(), "S3");
    assert.ok(player.isPlaying && audio.playing);
    assert.equal(forward(player.playingPlaylist!.songs), "S1 S3");
});

test("removing the current last song falls back to the previous one", () => {
    const { player, current } = setup();
    player.playSong("rock", "id-S3");
    player.removeSong("rock", "id-S3");
    assert.equal(current(), "S2");
});

test("removing the current song while paused stays paused", () => {
    const { player, current } = setup();
    player.playSong("rock", "id-S1");
    player.togglePlay();
    player.removeSong("rock", "id-S1");
    assert.equal(current(), "S2");
    assert.equal(player.isPlaying, false);
});

test("removing the only song stops the player", () => {
    const { player, audio, current } = setup("Only");
    player.togglePlay();
    player.removeSong("rock", "id-Only");
    assert.equal(current(), null);
    assert.equal(player.isPlaying, false);
    assert.equal(audio.playing, false);
    assert.equal(player.togglePlay().ok, false);
});

test("removing the next song skips it", () => {
    const { player, audio, current } = setup();
    player.playSong("rock", "id-S1");
    player.removeSong("rock", "id-S2");
    audio.finish();
    assert.equal(current(), "S3");
});

test("adding songs during playback: at the end and right after the current", () => {
    const { player, audio, current } = setup("S1 S2");
    player.playSong("rock", "id-S2");
    player.addSong("rock", song("S3"));
    player.addSong("rock", song("NEW"), 2); // between S2 and S3
    assert.equal(current(), "S2");
    audio.finish();
    assert.equal(current(), "NEW");
    audio.finish();
    assert.equal(current(), "S3");
});

test("duplicate song in the same playlist is rejected", () => {
    const { player } = setup();
    assert.equal(player.addSong("rock", song("S1")).ok, false);
    assert.equal(player.playlists.get("rock")!.size, 3);
});

test("switching playlist on screen does not interrupt playback", () => {
    const { player, audio, current } = setup();
    player.createPlaylist("Salsa", "salsa");
    player.addSong("salsa", song("X1"));
    player.playSong("rock", "id-S1");
    player.selectPlaylist("salsa");
    assert.equal(player.selectedPlaylist!.id, "salsa");
    assert.equal(player.playingPlaylist!.id, "rock");
    audio.finish();
    assert.equal(current(), "S2"); // continues inside Rock
    player.playSong("salsa", "id-X1");
    assert.equal(player.playingPlaylist!.id, "salsa");
    assert.equal(player.next().ok, false);
});

test("deleting the playlist that is playing stops playback", () => {
    const { player, audio, current } = setup();
    player.togglePlay();
    player.deletePlaylist("rock");
    assert.equal(current(), null);
    assert.equal(audio.playing, false);
    assert.equal(player.selectedPlaylist, null);
});

test("previous after 3 seconds restarts the current song", () => {
    const { player, audio, current } = setup();
    player.playSong("rock", "id-S2");
    audio.time = 10;
    player.previous();
    assert.equal(current(), "S2");
    assert.equal(audio.time, 0);
});

test("listening without adding: results play from their own list, playlists untouched", () => {
    const { player, audio, current } = setup();
    const results = new Playlist("results", "Search results");
    results.addSong(song("R1"));
    results.addSong(song("R2"));
    player.playSong("rock", "id-S1");
    assert.equal(player.playFrom(results, "id-R1").ok, true);
    assert.equal(current(), "R1");
    assert.equal(player.playlists.get("rock")!.size, 3); // nothing was added
    assert.equal(player.playlists.size, 1); // results are not a saved playlist
    audio.finish();
    assert.equal(current(), "R2"); // next result
    assert.equal(player.next().ok, false);
    assert.equal(player.playFrom(results, "nope").ok, false);
});

test("a result that is playing can be added to a playlist and keeps playing", () => {
    const { player, current } = setup();
    const results = new Playlist("results", "Search results");
    results.addSong(song("R1"));
    player.playFrom(results, "id-R1");
    assert.equal(player.addSong("rock", song("R1")).ok, true);
    assert.equal(current(), "R1");
    assert.equal(player.playingPlaylist, results);
    assert.equal(player.playlists.get("rock")!.size, 4);
});

test("a song that cannot be played is skipped; a chain of failures stops", () => {
    const { player, audio, current } = setup("S1 S2 S3 S4 S5 S6 S7");
    player.playSong("rock", "id-S1");
    audio.onError();
    assert.equal(current(), "S2");
    assert.ok(player.isPlaying);
    for (let i = 0; i < 6; i++) audio.onError();
    assert.equal(player.isPlaying, false); // gave up instead of skipping forever
    assert.equal(current(), "S5");
});

test("a failing last song just stops", () => {
    const { player, audio, current } = setup();
    player.playSong("rock", "id-S3");
    audio.onError();
    assert.equal(current(), "S3");
    assert.equal(player.isPlaying, false);
});

test("liked songs: like, unlike, newest first, and it is not a normal playlist", () => {
    const { player } = setup();
    assert.equal(player.isLiked("id-S1"), false);
    assert.equal(player.toggleLike(song("S1")).ok, true);
    player.toggleLike(song("S3"));
    assert.equal(forward(player.liked.songs), "S3 S1"); // newest first (addFirst)
    assert.ok(player.isLiked("id-S1"));
    assert.equal(player.playlists.size, 1); // not counted as a user playlist
    assert.equal(player.playlists.get("rock")!.size, 3); // the playlist is untouched
    player.toggleLike(song("S1"));
    assert.equal(forward(player.liked.songs), "S3");
    assert.equal(player.deletePlaylist(LIKED_ID).ok, false);
    assert.equal(player.createPlaylist("liked songs").ok, false);
});

test("liked songs can be played, reordered and unliked while playing", () => {
    const { player, audio, current } = setup();
    player.toggleLike(song("S1"));
    player.toggleLike(song("S2"));
    player.toggleLike(song("S3")); // S3 S2 S1
    player.playSong(LIKED_ID, "id-S3");
    assert.equal(player.playingPlaylist, player.liked);
    player.moveSong(LIKED_ID, 2, 1); // S3 S1 S2
    audio.finish();
    assert.equal(current(), "S1");
    player.toggleLike(song("S1")); // unlike the one that is playing
    assert.equal(current(), "S2");
    assert.ok(player.isPlaying);
});

test("shuffle plays every song exactly once, then stops", () => {
    const { player, audio, current } = setup("S1 S2 S3 S4 S5");
    player.random = () => 0.99; // always the last pending song
    player.playSong("rock", "id-S1");
    player.toggleShuffle();
    let order = current()!;
    for (let i = 0; i < 4; i++) {
        audio.finish();
        order += " " + current();
    }
    assert.equal(order, "S1 S5 S4 S3 S2");
    assert.equal(forward(player.playingPlaylist!.songs), "S1 S2 S3 S4 S5"); // list order untouched
    audio.finish();
    assert.equal(player.isPlaying, false); // round over
    assert.equal(player.next().ok, false);
});

test("shuffle with repeat starts a new round; turning it off returns to list order", () => {
    const { player, audio, current } = setup();
    player.random = () => 0;
    player.playSong("rock", "id-S2");
    player.toggleShuffle();
    player.toggleRepeat();
    audio.finish(); // S1
    audio.finish(); // S3
    assert.equal(current(), "S3");
    audio.finish(); // new round: first pending that is not S3
    assert.equal(current(), "S1");
    player.toggleShuffle(); // back to in-order
    audio.finish();
    assert.equal(current(), "S2");
});

test("shuffle copes with songs added and removed during the round", () => {
    const { player, audio, current } = setup();
    player.random = () => 0;
    player.playSong("rock", "id-S1");
    player.toggleShuffle();
    player.removeSong("rock", "id-S2");
    player.addSong("rock", song("NEW"));
    audio.finish();
    assert.equal(current(), "S3");
    audio.finish();
    assert.equal(current(), "NEW");
    audio.finish();
    assert.equal(player.isPlaying, false);
});

test("shuffle with a single song does not crash", () => {
    const { player, audio, current } = setup("Only");
    player.togglePlay();
    player.toggleShuffle();
    assert.equal(player.next().ok, false);
    player.toggleRepeat();
    audio.finish();
    assert.equal(current(), "Only");
    assert.ok(player.isPlaying);
});
