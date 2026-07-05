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

After changing Vercel environment variables, redeploy the Production deployment. Adding or editing env vars does not update an already-running deployment by itself.

`GOOGLE_REFRESH_TOKEN` grants read access to the single Gmail account that approved the OAuth flow. `SCHEDULED_INBOX_USER_EMAILS` does not grant access to extra mailboxes; it only tells Greyboard which sender addresses count as you when it looks for sent-mail follow-ups.

For two inboxes, keep one shared `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then add one refresh token per account:

```text
GMAIL_ACCOUNT_1_LABEL=UMass
GMAIL_ACCOUNT_1_EMAIL=tchang@umass.edu
GMAIL_ACCOUNT_1_REFRESH_TOKEN=1//...
GMAIL_ACCOUNT_1_ICON=T
GMAIL_ACCOUNT_1_COLOR=#e8b7d0

GMAIL_ACCOUNT_2_LABEL=Gmail
GMAIL_ACCOUNT_2_EMAIL=changg.terry@gmail.com
GMAIL_ACCOUNT_2_REFRESH_TOKEN=1//...
GMAIL_ACCOUNT_2_ICON=bird
GMAIL_ACCOUNT_2_COLOR=#5f6fcb
```

When numbered `GMAIL_ACCOUNT_*` values exist, Greyboard reads those accounts and shows a small account legend in the Inbox Feed.

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

Create a local-only env file:

```bash
cp .env.local.example .env.local
```

Fill in:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SCHEDULED_INBOX_USER_EMAILS=
```

Then run:

```bash
pnpm gmail:token
```

Shell env vars still work and override `.env.local` if both are present.

Open the printed Google URL, approve Gmail read-only access, paste the returned authorization code, then copy the printed `GOOGLE_REFRESH_TOKEN` into Vercel environment variables.

Do not commit the refresh token. Do not paste it into frontend code. Do not store it in localStorage.

A refresh token that starts with `1//` is normal.

### Validate Local Gmail OAuth

After adding `GOOGLE_REFRESH_TOKEN` to `.env.local`, run:

```bash
pnpm gmail:check
```

Expected success:

```text
Gmail OAuth check passed.
Authenticated Gmail profile loaded.
Profile email: you@example.com
Configured user email match: true
```

If this fails locally, fix the local Google OAuth values before touching Vercel.

If the profile email is your personal Gmail but you expected UMass mail, Greyboard can only see UMass messages that are visible inside that authorized Gmail account. To read both mailboxes, run `pnpm gmail:token` once while signed into `tchang@umass.edu` and once while signed into `changg.terry@gmail.com`, then put those two refresh tokens into `GMAIL_ACCOUNT_1_REFRESH_TOKEN` and `GMAIL_ACCOUNT_2_REFRESH_TOKEN`.

Sent follow-up todos have narrower limits: Greyboard checks only the authenticated account's Sent mail, looks at messages newer than 90 days and older than 7 days, checks the first batch of candidates, skips threads with a visible non-user reply after your sent message, and caps the final feed at 12 todos.

### Production Debug Diagnostics

This endpoint returns safe configuration diagnostics only:

```text
https://greyboard.vercel.app/api/scheduled-inbox/todos?debug=1
```

It shows whether env vars exist and the refresh token shape. It never returns secret values, access tokens, or email bodies.

### Gmail OAuth Troubleshooting

- A Google refresh token starting with `1//` is normal.
- Do not wrap Vercel env vars in quotes.
- Do not include spaces or line breaks in Vercel env vars.
- The refresh token must be generated using the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` deployed to Vercel.
- The refresh token reads the Gmail account shown by `pnpm gmail:check` as `Profile email`.
- Include that profile email in `SCHEDULED_INBOX_USER_EMAILS`.
- Add env vars to Production, not only Preview.
- Redeploy after changing Vercel env vars.
- If `pnpm gmail:check` passes but Vercel fails, the issue is probably Vercel env formatting, Vercel environment selection, or a missing redeploy.
- If `pnpm gmail:check` fails with `invalid_grant`, regenerate the refresh token. The token may be revoked, malformed, copied incorrectly, expired, or generated for different client credentials.
- If `pnpm gmail:check` fails with `invalid_client`, the client ID and client secret are wrong or mismatched.
- If production returns `unauthorized_client`, check OAuth client type and Google Cloud project setup.
- If production returns `access_denied`, check the Gmail account permissions and OAuth consent screen.
- Make sure the Gmail API is enabled in Google Cloud.
- If the OAuth consent screen is in Testing mode, add the Gmail account as a test user.

### Vercel Verification Checklist

1. In Vercel Project Settings, add exact env var names:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GMAIL_ACCOUNT_1_LABEL`
   - `GMAIL_ACCOUNT_1_EMAIL`
   - `GMAIL_ACCOUNT_1_REFRESH_TOKEN`
   - `GMAIL_ACCOUNT_1_ICON`
   - `GMAIL_ACCOUNT_1_COLOR`
   - `GMAIL_ACCOUNT_2_LABEL`
   - `GMAIL_ACCOUNT_2_EMAIL`
   - `GMAIL_ACCOUNT_2_REFRESH_TOKEN`
   - `GMAIL_ACCOUNT_2_ICON`
   - `GMAIL_ACCOUNT_2_COLOR`
2. Confirm each refresh token is raw text like `1//...`.
3. Confirm there are no quotes, spaces, or line breaks around values.
4. Confirm the token was generated with the same client ID and secret currently in Vercel.
5. Confirm the env vars are added to Production.
6. Redeploy the Production deployment.
7. Open `/api/scheduled-inbox/todos?debug=1`.
8. If debug looks configured, open `/api/scheduled-inbox/todos`.

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
