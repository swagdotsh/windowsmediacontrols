import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";

import { MediaStore } from "./MediaStore";
import { Player } from "./Player";

export const settings = definePluginSettings({
    showAppName: {
        type: OptionType.BOOLEAN,
        description: "Show which app is playing (click it to switch between apps when several are playing)",
        default: true
    },
    hideAfterPausedMinutes: {
        type: OptionType.NUMBER,
        description: "Hide the panel after media has been paused this many minutes (0 = never)",
        default: 5
    }
});

export default definePlugin({
    name: "WindowsMediaControls",
    description: "Control whatever is playing in the Windows media flyout (Spotify, Apple Music, browsers, ...) from a panel above your account. Disable SpotifyControls, they use the same spot.",
    authors: [{ name: "zekkie", id: 495635279387033603n }],
    settings,

    patches: [
        {
            find: "#{intl::USER_PROFILE_ACCOUNT_POPOUT_BUTTON_A11Y_LABEL}",
            replacement: {
                match: /(?<=\i\.jsxs?\)\()(\i),{(?=[^}]*?userTag:\i,occluded:)/,
                replace: "$self.PanelWrapper,{VencordOriginal:$1,"
            }
        }
    ],

    start() {
        MediaStore.start();
    },

    stop() {
        MediaStore.stop();
    },

    PanelWrapper({ VencordOriginal, ...props }) {
        return (
            <>
                <ErrorBoundary
                    fallback={() => (
                        <div className="vc-wmc-fallback">
                            <p>Failed to render Windows media panel :(</p>
                            <p>Check the console for errors</p>
                        </div>
                    )}
                >
                    <Player />
                </ErrorBoundary>
                <VencordOriginal {...props} />
            </>
        );
    }
});
