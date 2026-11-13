# CampusFlow — a free-tier-friendly collaborative LMS (Username Login)

A responsive React + Vite LMS with Supabase authentication/PostgreSQL/Realtime, a Cloudflare Worker API, private Google Drive media storage, and optional Gemini AI study assistance. It includes an interactive **design preview** before configuration. The preview uses sample data and does not save or synchronize anything.

## What works when configured

- **Username/password** sign-up and sign-in (no student email needed), profiles and profile pictures
- Admin-only module creation; modules are readable by every signed-in student
- Student-to-student direct conversations and private group chats
- Live message updates via Supabase Realtime
- PDF, image, Office document, audio and video attachments within conversations
- Module resources with title, description, uploader, upload date, file type and size
- **All actual file bytes stored in a private Google Drive account**, not Supabase Storage or PostgreSQL
- Online-now presence using WebSocket connections (not a historical list of everyone signed in)
- Optional Gemini AI resource summarization, PDF/image text extraction and question creation
- PWA installation on supported devices, without app store publication

### Architecture

```
Browser / Android PWA
     │
     ├── Cloudflare Pages: React frontend (public UI only)
     │
     ├── Supabase: Auth, Postgres metadata & text, RLS, Realtime Presence/Chats
     │
     └── Cloudflare Worker: authenticated API, secrets stored server-side
          ├── private Google Drive: PDFs/photos/videos/avatars/chat files
          └── Google Gemini: optional analysis on demand
```

**Username-only sign-in:** Students enter only a username and password, plus a full name when creating an account. Supabase Auth still uses a generated, non-deliverable alias internally because its password provider requires an email or phone identifier. The frontend does not store plaintext passwords. The `profiles` table contains a public username, not a student email. Without an email/phone recovery channel, forgotten passwords require administrator help.

The frontend has no Drive OAuth refresh token, Gemini API key, or Supabase service-role key. Google Drive files stay **private**. The Worker authenticates the student and verifies database access before retrieving a file. Changing the sharing settings of individual files to public is unnecessary.

## Prerequisites (all have free tiers)

- Node.js 20.19+ or 22.12+
- Free [Supabase](https://supabase.com/dashboard) account
- Free [Cloudflare](https://dash.cloudflare.com/) account
- A Google account with free Drive space (personal Google accounts include up to 15 GB shared across Google services)
- Free Google Cloud project with Google Drive API enabled
- Optional [Google AI Studio](https://aistudio.google.com/) API key for AI tasks (availability and quotas are not guaranteed)
- GitHub account recommended for the easiest deployment

## STEP 1 — Create Supabase database

1. Visit https://supabase.com/dashboard and create a project on the Free plan.
2. Wait for the project to be created. Open **SQL Editor** → **New query**.
3. Open `supabase/schema.sql`, copy the **entire file** into SQL Editor and click **Run**. This creates all tables, triggers, security policies and the RPC for safe chat creation.
4. In **Authentication → Providers → Email**, keep the **Email provider enabled** because Supabase Auth internally associates a password with an email/phone identifier. **Turn OFF “Confirm email” / “Email confirmations”**: students will not provide a real email address or receive a verification link.
   - The frontend turns a username such as `student123` into the internal alias `student123@users.campusflow.example.com` for authentication only. The reserved `example.com` domain does not represent a real student mailbox. **Students only see a username field.**
   - This username mapping is fixed in `src/username-auth.js`. Do not change the suffix after creating accounts.
   - This is an academic starter-project workaround, *not* native username authentication. There is no email-based password reset. The administrator must assist with account recovery, and abuse protection should be added before public registrations.
   - If you already deployed the older **email-login edition**, **do not rerun `schema.sql`**. Follow the migration instructions below instead.
5. In **Project Settings / Connect / API Keys** (dashboard wording may vary), collect:
   - Your project URL: `https://YOUR_PROJECT.supabase.co`
   - Your **publishable** API key for frontend use (`sb_publishable_...` or the legacy anon key).
   - Your **legacy service_role JWT key** for the Worker only. **Never paste it into the frontend or a public repository.** Some dashboards distinguish the new secret key from the legacy JWT service-role key; this Worker expects the legacy JWT value.
6. Under **Authentication → URL Configuration**, later set the Site URL to your deployed Cloudflare Pages URL (e.g. `https://campusflow.pages.dev`) and add your local development URL `http://localhost:5173` as a Redirect URL.
7. For the first admin, create an account on the LMS using a **username and password**. Then in Supabase SQL Editor run the following, replacing `adminuser` with that account’s username:

```sql
update public.profiles
set role = 'admin'
where username = 'adminuser';
```

**Security:** Do not create an admin simply by editing frontend state. Role assignment requires trusted access to Supabase SQL Editor. All student file writes are authorized through the Worker; ordinary students cannot grant themselves admin status.

## STEP 2 — Create Google Drive OAuth credentials

> This is the most technical step. Students do **not** have to connect their own Google accounts. One dedicated Google account owns the LMS files. Use a separate account for the project, rather than your main personal Drive account.

1. Visit https://console.cloud.google.com/ and create a new project named `CampusFlow LMS`.
2. Open **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**). Configure the app name, support email, contact email and External/production settings as appropriate for your project.
4. Add only the narrow Google Drive scope **`https://www.googleapis.com/auth/drive.file`**. This lets your app manage files it creates rather than accessing the Google account's entire Drive.
5. Create an **OAuth client ID** with application type **Web application**, and add this **Authorized redirect URI**:

   `https://developers.google.com/oauthplayground`

6. Copy the Google OAuth **Client ID** and **Client Secret**.
7. Visit [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/). Click the gear (settings) and enable **Use your own OAuth credentials**. Enter your Client ID and Client Secret. Use offline access and choose the exact Drive scope above. Select **Authorize APIs**, sign into the dedicated Drive-owning Google account, and approve access.
8. Use **Exchange authorization code for tokens**; copy the **refresh token**. Store it privately, never in GitHub or `src/`.
9. Important: a Google OAuth app with External publishing status **Testing** can issue refresh tokens expiring after **7 days**. Move to **In production** when permitted or reauthorize when necessary. Depending on your app's audience and chosen scope, Google may require consent-screen verification. Review Google's current OAuth policies before opening this to a large public audience.

**Why not a simple service account?** Google's guidance says service accounts cannot own Drive files on a consumer Drive account using a personal storage quota. This project uses delegated OAuth access on behalf of the dedicated owner account instead.

## STEP 3 — Create a private Drive folder

1. In this project, copy `.env.drive.local.example` to `.env.drive.local`.
2. Add the Client ID, Client Secret and refresh token from STEP 2.
3. Open a terminal in the project folder and run:

```bash
node --env-file=.env.drive.local scripts/create-drive-folder.mjs
```

4. The script creates an **app-owned** `CampusFlow LMS Media` folder and prints its Drive folder ID. Save the ID. Don't make the folder public.

Alternatively, the Worker supports leaving `GOOGLE_FOLDER_ID` empty; files will then be uploaded to the Drive root. Using the script keeps all LMS files organized in their own folder and works with the limited `drive.file` OAuth scope.

## STEP 4 — Deploy the secure Worker API to Cloudflare

Use the project root folder in a terminal:

```bash
cd worker
npx wrangler@latest login
npx wrangler@latest deploy
```

Your terminal will print a URL similar to:

`https://campusflow-media.YOUR-SUBDOMAIN.workers.dev`

In the Worker project folder, add the following **seven REQUIRED** secrets one at a time (the CLI prompts for the value):

```bash
npx wrangler@latest secret put SUPABASE_URL
npx wrangler@latest secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler@latest secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler@latest secret put GOOGLE_CLIENT_ID
npx wrangler@latest secret put GOOGLE_CLIENT_SECRET
npx wrangler@latest secret put GOOGLE_REFRESH_TOKEN
npx wrangler@latest secret put GOOGLE_FOLDER_ID
```

Recommended extra secret (replace your-actual-frontend-hostname with the actual Pages hostname, then also add localhost if you plan to test locally):

```bash
npx wrangler@latest secret put ALLOWED_ORIGINS
```

Value example:

`https://campusflow.pages.dev,http://localhost:5173`

The Worker defaults to allowing `http://localhost:5173` only, so configuring `ALLOWED_ORIGINS` is essential for your live website. After adding secrets, deploy again if necessary. Cloudflare Worker secrets are encrypted environment variables, not frontend configuration.

To enable AI (optional):

```bash
npx wrangler@latest secret put GEMINI_API_KEY
```

Get the optional Gemini API key from https://aistudio.google.com/apikey. The model is `gemini-2.5-flash-lite` by default. The AI tools will show an informative error if no API key is configured. Gemini free-tier access depends on model/region/quota and may change; do not enter a paid billing plan without understanding costs.

## STEP 5 — Configure and test locally

From the project root:

```bash
cp .env.example .env
```

**On Windows CMD**, instead use:

```cmd
copy .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_public_supabase_key
VITE_API_URL=https://campusflow-media.YOUR-SUBDOMAIN.workers.dev
```

Then:

```bash
npm install
node scripts/test-username-auth.mjs
npm run dev
```

Open `http://localhost:5173` in your browser. Without configured `.env` settings, the app shows a labeled **design preview** using fake example students and modules; it does not save or synchronize information.

## STEP 6 — Host the website on Cloudflare Pages (Free)

### Recommended: GitHub auto-deployment

1. Create a **private or public GitHub repository** for the code. `.env`, `.env.drive.local`, `.dev.vars` and `worker/.dev.vars` are excluded by `.gitignore`.
2. Upload/push the project code to GitHub (never upload passwords or refresh tokens).
3. Open https://dash.cloudflare.com → **Workers & Pages** → create a Pages application → **Connect to Git** (menu wording may change).
4. Select your repository.
5. Framework preset: **Vite**.
6. Build command: `npm run build`.
7. Build output directory: `dist`.
8. In Pages project **Settings → Environment variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_API_URL`
9. Click **Save and Deploy**. Cloudflare provides a free `https://YOUR-PROJECT.pages.dev` website URL. New Git commits can trigger automatic deploys.
10. Return to Cloudflare Worker secrets and set `ALLOWED_ORIGINS` to this exact Pages origin and optionally `http://localhost:5173` for development.
11. Return to Supabase → Authentication → URL Configuration. Set the production **Site URL** to the Pages site and configure the accepted redirect URLs.
12. Open the Pages website, create a student account using **username and password**, then assign admin permissions using the SQL command in STEP 1. Refresh the page. No verification emails are sent.

### Alternative: manual Pages deployment

Run `npm install` and `npm run build` locally. In Cloudflare Pages choose a direct upload of the generated `dist` folder. The public `VITE_...` values must be in `.env` **before** building. Keep using GitHub for easier updates.

## STEP 7 — Test every feature

1. Register student A and student B, on **two different browsers** (or normal + incognito).
2. Promote student A to admin using SQL Editor. Refresh A; it can now click **New module**. Student B should not see the admin control.
3. As either student, select a module → **Upload resource** → choose a small PDF and a descriptive title. Both students should see it.
4. Confirm a new file appears in the private `CampusFlow LMS Media` folder; Supabase `resources` holds only metadata and a Drive file ID.
5. From the **Students** view, click **Send message** to open a private conversation. Try messages in both browsers.
6. Click **New group**, choose group members and send group messages.
7. Try **Attach file** in a conversation; only chat members should have access to the attachment.
8. Both connected users should appear in the online list. Closing a tab takes a short while to clear the presence entry; this reflects active connections, not merely authentication.
9. Upload a profile picture, then verify it shows in profiles and online cards.
10. If Gemini is configured, choose a resource with a **PDF, JPG/PNG/WebP or text** file of <= 3 MB, click **AI tools** and try Summary, Extract text and Quiz.

## File & privacy limitations

| Feature | MVP limit |
| --- | --- |
| Upload size | Up to 20 MB per resource/chat attachment |
| Profile picture | Up to 2 MB |
| AI analysis | PDF, JPG, PNG, WebP, TXT, Markdown; <= 3 MB |
| Group members | Maximum 30 |
| Chat text | Up to 2,000 characters in the UI |
| Module resources | Any signed-in student can read and share resources |
| Private chats | Only members can read messages and attachments |
| Google Drive folder | Private to the LMS owner; the Worker proxies files after access checks |
| AI privacy | Triggered manually; source bytes sent to Google Gemini, subject to its service terms |

**These are starter-project limits**, not all hard platform limits. Larger uploads are more reliable with resumable Drive uploads and a different compute/storage design. Files aren't streamed through Supabase. Deleting database records manually does not delete their Drive files; the project does not yet implement Drive-backed deletion or orphan-file cleanup. It is a functioning academic MVP architecture, not an audited production deployment. Before deploying to a large school, add monitoring, abuse protection, retention/deletion workflows, backups, moderation, better rate limits, and security reviews.

## Troubleshooting

**I see sample students instead of login.** The three frontend `VITE_` environment variables are missing or still contain placeholders. Restart Vite after editing `.env`, or rebuild Pages after changing environment variables.

**I can log in but see no profile.** For a fresh installation, run `schema.sql` and verify the trigger exists. For an older installation, apply `migrate_to_usernames.sql` as described below.

**Uploads say “Origin not allowed”.** Set the Worker's `ALLOWED_ORIGINS` to the exact browser origin including `https://` and without a trailing slash.

**Uploads say Google authentication failed / invalid_grant.** The OAuth refresh token may have expired (Testing mode often expires after 7 days), been revoked, or be for a different OAuth client. Reauthorize the dedicated owner and update the secret.

**Google Drive upload reports insufficient permissions.** Ensure the OAuth scope is `drive.file`, and run `create-drive-folder.mjs` to create the target folder with the same OAuth client. A manually created folder may not be accessible under the limited scope.

**Sign-up asks for an email confirmation.** Go to Supabase Authentication → Providers → Email and turn OFF **Confirm email**; the LMS does not use student email addresses. If disabling confirmation is unacceptable for your security requirements, use an invite-only provisioning system or a real username-native authentication service.

**“Username already taken.”** Choose a new one. Usernames are case-insensitive and 3–24 characters long, start with a letter and contain only letters, numbers and underscores.

**Forgotten password.** The LMS does not have a self-service recovery channel because it deliberately collects no student email or phone number. A trusted admin can reset credentials using Supabase admin tools; verify the student's identity first.

**If old accounts cannot log in.** For an earlier email-based deployment, complete both the SQL and admin API migration steps below. Merely changing the frontend does not convert the old Supabase authentication IDs.

**Messages are not updating.** Check that `supabase_realtime` publication includes `messages`, and ensure both students are still connected.

**AI fails.** Check Gemini API access in your country, quota, API key, supported file type and 3 MB file limit. AI calls are optional; all other LMS features work without Gemini.

**Cloudflare free limits.** Worker free usage includes daily request and CPU limits; large file transfers or high traffic may require upgrades. Personal Google Drive has shared free storage limits and is not a guaranteed high-concurrency video CDN. Supabase free projects may pause after inactivity.

## Migrating from the previous email-login version (only for existing deployments)

**Skip this entire section for new installations.** If an existing database has registered students, changing the login form alone will lock them out. Complete this one-time migration with a backup and a maintenance window:

1. Back up your existing Supabase tables and export a list of account IDs. Temporarily stop new registrations.
2. In Supabase SQL Editor, run **`supabase/migrate_to_usernames.sql`**. This adds unique usernames based on old email local parts and drops the public profile email column. Duplicate/invalid handles get a generated `student_<id>` username. **Do not rerun `schema.sql` on an already initialized database**, because it includes CREATE POLICY statements.
3. On your trusted local computer, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your **local shell environment** (not in GitHub, the frontend or `.env`). Install dependencies with `npm install`.
4. Inspect the planned changes without altering anything:

   ```bash
   node scripts/migrate-legacy-accounts.mjs
   ```

5. After checking the usernames, apply the changes:

   ```bash
   node scripts/migrate-legacy-accounts.mjs --apply
   ```

6. The script updates the **internal Supabase Auth identifier** for each account to its generated username alias without changing passwords or user IDs. Have all students sign out and sign in using the username. Check both admin and student accounts.

⚠️ The script uses high-privilege credentials. Store these privately, run only once (it is safe to rerun to retry failures), and review the user mapping before applying. If you already rely on real email verification/recovery or non-password providers, plan a custom migration instead.

## Key files

```text
CampusFlow_LMS/
├── src/
│   ├── App.jsx           React LMS pages and actions
│   ├── styles.css        Responsive visual design
│   ├── supabase.js       Public Supabase client + authorized media fetch
│   ├── username-auth.js  Username normalization and internal alias mapping
│   └── main.jsx          App entry point
├── worker/
│   ├── index.js          Authenticated Drive upload/download & optional Gemini
│   └── wrangler.toml     Cloudflare Worker deployment config
├── supabase/
│   ├── schema.sql        New username-based tables, triggers, roles, RLS, chat RPC
│   └── migrate_to_usernames.sql  One-time upgrade for existing profiles
├── scripts/
│   ├── create-drive-folder.mjs  OAuth-owned folder setup
│   ├── migrate-legacy-accounts.mjs  Optional old auth-user conversion
│   └── test-username-auth.mjs  Offline username validation tests
├── public/              Web app icons and manifest
├── .env.example          Browser-safe environment variables
├── .env.drive.local.example  Local-only OAuth setup template
└── README.md            Full deployment guide
```

### Free-tier references

- Supabase pricing: https://supabase.com/pricing
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages docs: https://developers.cloudflare.com/pages/
- Google Drive API docs: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google Drive API OAuth scope: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google OAuth refresh token lifetime: https://developers.google.com/identity/protocols/oauth2
- Gemini API prices/quotas: https://ai.google.dev/gemini-api/docs/pricing
