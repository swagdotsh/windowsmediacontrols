import { ChildProcessWithoutNullStreams, spawn } from "child_process";

import { SMTC_SCRIPT } from "./smtcScript";

let proc: ChildProcessWithoutNullStreams | null = null;
let wanted = false;
let restartTimer: NodeJS.Timeout | null = null;

let state: any = null;
let thumb: { key: string; url: string | null; } | null = null;
let revision = 0;

function launch() {
    if (proc || !wanted) return;

    const encoded = Buffer.from(SMTC_SCRIPT, "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
        windowsHide: true
    });
    proc = p;

    let buf = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("{")) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.type === "thumb") {
                    thumb = { key: msg.key, url: msg.data ? `data:${msg.mime};base64,${msg.data}` : null };
                } else {
                    state = msg;
                }
                revision++;
            } catch { }
        }
    });
    p.stderr.resume();
    p.on("error", () => { });
    p.on("exit", () => {
        if (proc === p) proc = null;
        state = null;
        revision++;
        if (wanted && !restartTimer) restartTimer = setTimeout(() => {
            restartTimer = null;
            launch();
        }, 3000);
    });
}

export function start() {
    wanted = true;
    launch();
}

export function stop() {
    wanted = false;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    if (proc) {
        proc.stdin.end();
        const p = proc;
        setTimeout(() => p.exitCode === null && p.kill(), 2000);
        proc = null;
    }
    state = null;
    thumb = null;
}

export function poll(_, sinceRevision: number) {
    if (sinceRevision === revision) return { revision };
    return { revision, state, thumbKey: thumb?.key ?? null };
}

export function getThumbnail(_, key: string) {
    return thumb?.key === key ? thumb.url : null;
}

export function command(_, cmd: string) {
    if (!/^[a-z]+( [\w.!\-|]+)?$/i.test(cmd)) return;
    proc?.stdin.write(cmd + "\n");
}
