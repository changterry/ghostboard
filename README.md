# Greyboard

Greyboard is a shareable black-screen chalkboard for big todo notes and quick drawing. The V1 product target is simple: send someone a website link, they open it, and they can use the board immediately.

## Final User Experience

Send a URL like:

```text
https://greyboard.vercel.app
```

The recipient opens the link in Chrome, Safari, Edge, or iPad Safari and starts using Greyboard. There is no download, install, account, app store, browser extension, backend, or terminal command required for the end user.

## Local-Only Data

Greyboard V1 stores board data locally in the user's browser with local browser storage.

- Refreshing the page keeps the board.
- Closing and reopening the same browser keeps the board.
- Different browsers or devices have different boards.
- Clearing browser site data can delete the board.
- Cloud sync is intentionally not included in V1.

## Supported Browsers

- Chrome
- Safari
- Edge
- iPad Safari, assuming pointer events work correctly for the device/input combination

## Developer Setup

```bash
pnpm install
pnpm dev
```

Build the static site:

```bash
pnpm build
```

The deployable static output is written to `dist/`.

## Deploy To Vercel

1. Push this repository to GitHub.
2. In Vercel, create a new project and import the GitHub repo.
3. Use the default Vite settings, or explicitly set:
   - Build command: `pnpm build`
   - Output directory: `dist`
4. Deploy.

After deployment, the app should open directly at the Vercel URL, for example:

```text
https://greyboard.vercel.app
```

## Acceptance Checklist

- A deployed Vercel link opens directly to Greyboard.
- A new user can use the board with only the link.
- Text, draw, erase, undo, and redo work from the hosted link.
- Refresh keeps the board in the same browser.
- No download or install prompts are required.
