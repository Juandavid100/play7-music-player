/**
 * YouTube Data API key (free, from https://console.cloud.google.com).
 * It is used ONLY to search for songs; playback uses YouTube's official player.
 *
 * The key is NOT written in the code. It is read from the environment:
 *  - on your computer: a `.env` file (ignored by git) with
 *        VITE_YOUTUBE_API_KEY=your-key
 *  - on GitHub: a repository secret with the same name, used by the deploy workflow.
 */
export const YOUTUBE_API_KEY: string = import.meta.env?.VITE_YOUTUBE_API_KEY ?? "";
