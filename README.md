# WindowsMediaControls

A Vencord userplugin that shows a media panel above the Discord account panel and controls whatever is playing in the Windows media flyout (Spotify, Apple Music, browsers, Media Player, ...).

- Cover art, title, artist, album and the source app
- Seek bar (when the app supports seeking), shuffle, previous, play/pause, next, repeat
- Click the app tag or right-click the panel to switch between apps when several are playing

It talks to Windows through a hidden PowerShell process (`smtcScript.ts`), so no native modules are needed. Windows only.

## Install

Userplugins only work in a Vencord build made from source, not the regular installer.

```sh
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
git clone <this repo> src/userplugins/windowsMediaControls
pnpm install
pnpm build
pnpm inject
```

Then enable **WindowsMediaControls** in Vencord's plugin settings. Disable **SpotifyControls**, since both use the same spot.

After editing: `pnpm build`, then Ctrl+R in Discord. After a Discord update removes the patch: close Discord and run `pnpm inject` again.
