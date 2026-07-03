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

## Scheduled Inbox Gmail Setup

Greyboard's Inbox Feed calls the server route:

```text
GET /api/scheduled-inbox/todos
```

The browser never talks to Gmail directly and never receives Gmail credentials. If OAuth is not configured, the route returns:

```json
{ "error": "Gmail integration not configured", "todos": [] }
```

### Required Server Env Vars

Set these in Vercel project settings as server-side environment variables:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
SCHEDULED_INBOX_USER_EMAILS=you@example.com,school@example.edu
```

Only add `OPENAI_API_KEY` later if the server route is changed to use server-side AI classification. Do not expose any of these as `VITE_` variables.

### Google Cloud OAuth

1. Create or open a Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen for your account.
4. Create an OAuth Client ID.
5. Use the narrow read-only Gmail scope:

```text
https://www.googleapis.com/auth/gmail.readonly
```

6. Add this redirect URI to the OAuth client:

```text
http://localhost:5173/oauth2callback
```

### Generate A Refresh Token

In a local shell, set only local environment variables:

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
pnpm gmail:token
```

On Windows PowerShell:

```powershell
$env:GOOGLE_CLIENT_ID="..."
$env:GOOGLE_CLIENT_SECRET="..."
pnpm gmail:token
```

Open the printed Google URL, approve Gmail read-only access, paste the returned authorization code, then copy the printed `GOOGLE_REFRESH_TOKEN` into Vercel environment variables.

Do not commit the refresh token. Do not paste it into frontend code. Do not store it in localStorage.

### What The Route Returns

The server route fetches recent Gmail metadata, ignores obvious bulk/promotional sources such as Handshake alerts, and returns only action-shaped todos such as:

- personal replies
- professor, lab, or academic responses
- recruiter or internship messages expecting a response
- meeting/date/deadline changes
- sent cold emails older than one week that may need follow-up

The current implementation is conservative heuristic classification. It does not send email, modify Gmail, create Gmail drafts, or request Gmail write scopes.

## Acceptance Checklist

- A deployed Vercel link opens directly to Greyboard.
- A new user can use the board with only the link.
- Text, draw, erase, undo, and redo work from the hosted link.
- Refresh keeps the board in the same browser.
- No download or install prompts are required.
