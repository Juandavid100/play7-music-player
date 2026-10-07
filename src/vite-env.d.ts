// Types for the environment variables that Vite injects at build time.
interface ImportMetaEnv {
    readonly VITE_YOUTUBE_API_KEY?: string;
}
interface ImportMeta {
    readonly env?: ImportMetaEnv;
}
