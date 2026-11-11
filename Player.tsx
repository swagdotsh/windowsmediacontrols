import "./styles.css";

import { CopyIcon, ImageIcon } from "@components/Icons";
import { SeekBar } from "@plugins/spotifyControls/SeekBar";
import { debounce } from "@shared/debounce";
import { classNameFactory } from "@utils/css";
import { copyWithToast, openImageModal } from "@utils/discord";
import { classes } from "@utils/misc";
import { formatDuration } from "@utils/text";
import { ContextMenuApi, Menu, React, useEffect, useState } from "@webpack/common";

import { settings } from ".";
import { MediaState, MediaStore, prettyAppName, useMedia } from "./MediaStore";

const cl = classNameFactory("vc-wmc-");

function Svg(path: string, label: string) {
    return () => (
        <svg className={cl("button-icon")} height="24" width="24" viewBox="0 0 24 24" fill="currentColor" aria-label={label} focusable={false}>
            <path d={path} />
        </svg>
    );
}

const PlayIcon = Svg("M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18c.62-.39.62-1.29 0-1.69L9.54 5.98C8.87 5.55 8 6.03 8 6.82z", "Play");
const PauseIcon = Svg("M8 19c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2s-2 .9-2 2v10c0 1.1.9 2 2 2zm6-12v10c0 1.1.9 2 2 2s2-.9 2-2V7c0-1.1-.9-2-2-2s-2 .9-2 2z", "Pause");
const PrevIcon = Svg("M7 6c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1V7c0-.55.45-1 1-1zm3.66 6.82l5.77 4.07c.66.47 1.58-.01 1.58-.82V7.93c0-.81-.91-1.28-1.58-.82l-5.77 4.07c-.57.4-.57 1.24 0 1.64z", "Previous");
const NextIcon = Svg("M7.58 16.89l5.77-4.07c.56-.4.56-1.24 0-1.63L7.58 7.11C6.91 6.65 6 7.12 6 7.93v8.14c0 .81.91 1.28 1.58.82zM16 7v10c0 .55.45 1 1 1s1-.45 1-1V7c0-.55-.45-1-1-1s-1 .45-1 1z", "Next");
const RepeatIcon = Svg("M7 7h10v1.79c0 .45.54.67.85.35l2.79-2.79c.2-.2.2-.51 0-.71l-2.79-2.79c-.31-.31-.85-.09-.85.36V5H6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1s1-.45 1-1V7zm10 10H7v-1.79c0-.45-.54-.67-.85-.35l-2.79 2.79c-.2.2-.2.51 0 .71l2.79 2.79c.31.31.85.09.85-.36V19h11c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1s-1 .45-1 1v3z", "Repeat");
const ShuffleIcon = Svg("M10.59 9.17L6.12 4.7c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41l4.46 4.46 1.42-1.4zm4.76-4.32l1.19 1.19L4.7 17.88c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L17.96 7.46l1.19 1.19c.31.31.85.09.85-.36V4.5c0-.28-.22-.5-.5-.5h-3.79c-.45 0-.67.54-.36.85zm-.52 8.56l-1.41 1.41 3.13 3.13-1.2 1.2c-.31.31-.09.85.36.85h3.79c.28 0 .5-.22.5-.5v-3.79c0-.45-.54-.67-.85-.35l-1.19 1.19-3.13-3.14z", "Shuffle");

function Button({ className, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button className={classes(cl("button"), disabled && cl("disabled"), className)} disabled={disabled} {...props} />;
}

function Controls({ s }: { s: MediaState; }) {
    const playing = s.status === "playing";
    const nextRepeat = s.repeat === "none" ? "list" : s.repeat === "list" ? "track" : "none";

    return (
        <div className={cl("button-row")}>
            <Button
                className={classes(cl("small"), s.shuffle && cl("toggled"))}
                disabled={!s.canShuffle}
                onClick={() => MediaStore.setShuffle(!s.shuffle)}
                title="Shuffle"
            >
                <ShuffleIcon />
            </Button>
            <Button disabled={!s.canPrev} onClick={MediaStore.prev} title="Previous">
                <PrevIcon />
            </Button>
            <Button disabled={playing ? !s.canPause : !s.canPlay} onClick={MediaStore.toggle} title={playing ? "Pause" : "Play"}>
                {playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <Button disabled={!s.canNext} onClick={MediaStore.next} title="Next">
                <NextIcon />
            </Button>
            <Button
                className={classes(cl("small"), s.repeat && s.repeat !== "none" && cl("toggled"))}
                disabled={!s.canRepeat}
                onClick={() => MediaStore.setRepeat(nextRepeat)}
                title="Repeat"
                style={{ position: "relative" }}
            >
                {s.repeat === "track" && <span className={cl("repeat-1")}>1</span>}
                <RepeatIcon />
            </Button>
        </div>
    );
}

const seek = debounce((v: number) => MediaStore.seek(v));

function Progress({ s }: { s: MediaState; }) {
    const duration = (s.endMs ?? 0) - (s.startMs ?? 0);
    const [position, setPosition] = useState(() => MediaStore.position(s));

    useEffect(() => {
        setPosition(MediaStore.position(s));
        if (s.status !== "playing") return;
        const id = setInterval(() => setPosition(MediaStore.position(s)), 500);
        return () => clearInterval(id);
    }, [s.positionMs, s.updatedAt, s.status, s.startMs, s.endMs]);

    if (duration <= 0) return null;

    const onChange = (v: number) => {
        setPosition(v);
        seek(v);
    };

    return (
        <div id={cl("progress-bar")} className={classes(!s.canSeek && cl("no-seek"))}>
            <span className={classes(cl("progress-time"), cl("time-left"))}>{formatDuration(position)}</span>
            <SeekBar
                initialValue={position}
                minValue={0}
                maxValue={duration}
                onValueChange={onChange}
                asValueChanges={onChange}
                onValueRender={formatDuration}
                disabled={!s.canSeek}
            />
            <span className={classes(cl("progress-time"), cl("time-right"))}>{formatDuration(duration)}</span>
        </div>
    );
}

function CoverMenu({ s, thumbnail }: { s: MediaState; thumbnail: string | null; }) {
    const text = [s.title, s.artist].filter(Boolean).join(" - ");
    return (
        <Menu.Menu navId="vc-wmc-cover-menu" onClose={ContextMenuApi.closeContextMenu} aria-label="Media Menu">
            <Menu.MenuItem id="vc-wmc-copy" label="Copy Song Name" icon={CopyIcon} action={() => copyWithToast(text)} />
            {thumbnail && (
                <Menu.MenuItem id="vc-wmc-view-cover" label="View Cover" icon={ImageIcon} action={() => openImageModal({ url: thumbnail, width: 640, height: 640 })} />
            )}
            {s.sessions.length > 1 && (
                <Menu.MenuGroup label="Source">
                    <Menu.MenuRadioItem id="vc-wmc-src-auto" group="vc-wmc-src" label="Automatic" checked={s.selected === "auto"} action={() => MediaStore.select("auto")} />
                    {s.sessions.map(id => (
                        <Menu.MenuRadioItem key={id} id={"vc-wmc-src-" + id} group="vc-wmc-src" label={prettyAppName(id)} checked={s.selected === id} action={() => MediaStore.select(id)} />
                    ))}
                </Menu.MenuGroup>
            )}
        </Menu.Menu>
    );
}

function Info({ s, thumbnail }: { s: MediaState; thumbnail: string | null; }) {
    const [expanded, setExpanded] = useState(false);
    const openMenu = (e: React.MouseEvent) => ContextMenuApi.openContextMenu(e, () => <CoverMenu s={s} thumbnail={thumbnail} />);

    const img = thumbnail && (
        <img id={cl("album-image")} src={thumbnail} alt="Cover" onClick={() => setExpanded(!expanded)} onContextMenu={openMenu} />
    );

    if (expanded && img) return <div id={cl("album-expanded-wrapper")}>{img}</div>;

    return (
        <div id={cl("info-wrapper")} onContextMenu={openMenu}>
            {img}
            <div id={cl("titles")}>
                <div id={cl("song-title")} className={cl("ellipoverflow")} title={s.title}>{s.title || "Unknown"}</div>
                {s.artist && <div className={classes(cl("ellipoverflow"), cl("secondary"))} title={s.artist}>{s.artist}</div>}
                {s.album && <div className={classes(cl("ellipoverflow"), cl("secondary"))} title={s.album}>{s.album}</div>}
            </div>
            {settings.store.showAppName && (
                <div
                    className={classes(cl("app"), s.sessions.length > 1 && cl("app-clickable"))}
                    title={s.sessions.length > 1 ? "Click to switch source" : s.app}
                    onClick={() => {
                        if (s.sessions.length < 2) return;
                        const i = s.sessions.indexOf(s.app!);
                        MediaStore.select(s.sessions[(i + 1) % s.sessions.length]);
                    }}
                >
                    {prettyAppName(s.app)}
                </div>
            )}
        </div>
    );
}

export function Player() {
    const { state: s, thumbnail } = useMedia();
    const [hidden, setHidden] = useState(false);
    const playing = s?.status === "playing";

    useEffect(() => {
        setHidden(false);
        const mins = settings.store.hideAfterPausedMinutes;
        if (playing || !mins) return;
        const t = setTimeout(() => setHidden(true), mins * 60_000);
        return () => clearTimeout(t);
    }, [playing, s?.title]);

    if (!s?.active || !s.title || hidden || s.status === "closed") return null;

    return (
        <div id={cl("player")} style={{ "--vc-wmc-cover": thumbnail ? `url(${thumbnail})` : "none" } as React.CSSProperties}>
            <Info s={s} thumbnail={thumbnail} />
            <Progress s={s} />
            <Controls s={s} />
        </div>
    );
}
