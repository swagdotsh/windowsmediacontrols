import { PluginNative } from "@utils/types";
import { React } from "@webpack/common";

const Native = VencordNative.pluginHelpers.WindowsMediaControls as PluginNative<typeof import("./native")>;

export interface MediaState {
    active: boolean;
    sessions: string[];
    selected: string;
    app?: string;
    title?: string;
    artist?: string;
    album?: string;
    thumbKey?: string;
    status?: "closed" | "opened" | "changing" | "stopped" | "playing" | "paused";
    positionMs?: number;
    startMs?: number;
    endMs?: number;
    updatedAt?: number;
    shuffle?: boolean | null;
    repeat?: "none" | "track" | "list" | null;
    canPlay?: boolean;
    canPause?: boolean;
    canNext?: boolean;
    canPrev?: boolean;
    canSeek?: boolean;
    canShuffle?: boolean;
    canRepeat?: boolean;
}

interface Snapshot {
    state: MediaState | null;
    thumbnail: string | null;
}

let snapshot: Snapshot = { state: null, thumbnail: null };
let revision = -1;
let thumbKey: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit(next: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach(l => l());
}

async function tick() {
    try {
        const res = await Native.poll(revision);
        if (res.revision === revision) return;
        revision = res.revision;

        let { thumbnail } = snapshot;
        if (res.thumbKey !== thumbKey) {
            thumbKey = res.thumbKey ?? null;
            thumbnail = thumbKey ? await Native.getThumbnail(thumbKey) : null;
        }
        emit({ state: res.state ?? null, thumbnail });
    } catch { }
}

export const MediaStore = {
    start() {
        Native.start();
        timer ??= setInterval(tick, 500);
    },
    stop() {
        if (timer) clearInterval(timer);
        timer = null;
        Native.stop();
        revision = -1;
        thumbKey = null;
        emit({ state: null, thumbnail: null });
    },

    position(s: MediaState) {
        const base = (s.positionMs ?? 0) - (s.startMs ?? 0);
        const elapsed = s.status === "playing" && s.updatedAt ? Math.max(0, Date.now() - s.updatedAt) : 0;
        const duration = (s.endMs ?? 0) - (s.startMs ?? 0);
        const pos = base + elapsed;
        return duration > 0 ? Math.min(pos, duration) : pos;
    },

    send(cmd: string) {
        Native.command(cmd);
        setTimeout(tick, 150);
    },
    toggle: () => MediaStore.send("toggle"),
    next: () => MediaStore.send("next"),
    prev: () => MediaStore.send("prev"),
    seek: (ms: number) => MediaStore.send(`seek ${Math.round(ms + (snapshot.state?.startMs ?? 0))}`),
    setShuffle: (on: boolean) => MediaStore.send(`shuffle ${on}`),
    setRepeat: (mode: "none" | "track" | "list") => MediaStore.send(`repeat ${mode}`),
    select: (appId: string) => MediaStore.send(`select ${appId}`),
};

export function useMedia() {
    return React.useSyncExternalStore(
        cb => (listeners.add(cb), () => void listeners.delete(cb)),
        () => snapshot
    );
}

const KNOWN_APPS: [RegExp, string][] = [
    [/^Spotify/i, "Spotify"],
    [/AppleMusic/i, "Apple Music"],
    [/^chrome/i, "Chrome"],
    [/^msedge/i, "Edge"],
    [/^308046B0AF4A39CB|firefox/i, "Firefox"],
    [/^opera/i, "Opera"],
    [/^brave/i, "Brave"],
    [/ZuneMusic|Media\.Player/i, "Media Player"],
    [/^vlc/i, "VLC"],
    [/^foobar2000/i, "foobar2000"],
    [/^Discord/i, "Discord"],
    [/TIDAL/i, "TIDAL"],
    [/Deezer/i, "Deezer"],
    [/AmazonMusic/i, "Amazon Music"],
    [/YouTubeMusic|ytmdesktop/i, "YouTube Music"],
];

export function prettyAppName(appId?: string) {
    if (!appId) return "Unknown";
    for (const [re, name] of KNOWN_APPS) if (re.test(appId)) return name;
    const last = appId.split(/[\\/]/).pop()!.replace(/\.exe$/i, "");
    return last.split("!")[0].split("_")[0].split(".").pop() || appId;
}
