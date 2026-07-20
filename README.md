# Home Base — self-hosted multi-user dashboard

A small Node.js/Express app you run on one Windows computer. Anyone on your
network can browse to it, log in (or create their own account), and get a
personal page with a clock, a timer (presets or any custom duration), a
to-do list, a notepad, and a customizable background. A sticky bar at the
top — the "assistant" — shows things every user sees: today's date, local
weather, and any reminders or updates you (the admin) post.

Everything is stored in one SQLite file on the host computer. No cloud
service, no separate database server required.

---

## 1. What you need on the host computer

- **Windows** with **IIS** (Internet Information Services) enabled
  - Turn on via *Control Panel → Programs → Turn Windows features on or off →
    Internet Information Services*
- **Node.js LTS** — download from https://nodejs.org and install
- **iisnode** — lets IIS run a Node app. Installer:
  https://github.com/Azure/iisnode/releases (get the `iisnode-full-vX-x64.msi`)
- **IIS URL Rewrite Module** — required by iisnode:
  https://www.iis.net/downloads/microsoft/url-rewrite

Install these in order: Node.js → IIS → URL Rewrite Module → iisnode.

---

## 2. Copy the project onto the host computer

Copy this whole folder to somewhere IIS can serve it, e.g.:

```
C:\inetpub\wwwroot\home-base\
```

**Do not copy a `node_modules` folder between computers** — one of the
dependencies (`better-sqlite3`) compiles a native binary specific to the
OS/architecture it's installed on. Always run the install step below
directly on the Windows host.

Open Command Prompt or PowerShell **on the host computer**, in that folder:

```powershell
cd C:\inetpub\wwwroot\home-base
npm install --omit=dev
```

---

## 3. Configure environment settings

Copy `.env.example` to `.env`:

```powershell
copy .env.example .env
```

Open `.env` and set a real session secret (a random string — anyone who
knows this can forge login sessions, so keep it private):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `SESSION_SECRET` in `.env`. Leave `COOKIE_SECURE=false`
unless you later put this behind HTTPS.

---

## 4. Set up the IIS site

1. Open **IIS Manager**.
2. Right-click **Sites → Add Website**.
   - **Site name:** Home Base (or whatever you like)
   - **Physical path:** `C:\inetpub\wwwroot\home-base`
   - **Binding:** Type `http`, IP Address `All Unassigned`, Port `80` (or
     another port if 80 is already used — e.g. `8080`)
3. Give the site's **Application Pool** these settings (Application Pools →
   select it → Advanced Settings):
   - **.NET CLR version: No Managed Code** (Node handles everything, not
     .NET)
4. **Folder permissions:** the app needs to write to its own `data\` and
   `public\uploads\` folders (for the database, sessions, and uploaded
   backgrounds). Right-click the `home-base` folder → Properties →
   Security → give **Modify** permission to `IIS_IUSRS` (or the specific
   app pool identity, `IIS AppPool\<your pool name>`).

The included `web.config` tells IIS to hand every request to `server.js`
via iisnode — you don't need to configure routing manually.

Browse to `http://localhost/` on the host computer to confirm it loads.

---

## 5. Open it up to other devices on your network

1. **Windows Firewall:** allow inbound traffic on the port you bound IIS to.
   *Control Panel → Windows Defender Firewall → Advanced Settings → Inbound
   Rules → New Rule → Port* → enter `80` (or your chosen port) → Allow.
2. **Find the host computer's local IP address:** open Command Prompt and
   run `ipconfig`, look for `IPv4 Address` (something like `192.168.1.42`).
3. From any other phone, tablet, or computer **on the same
   network/Wi-Fi**, open a browser to:

   ```
   http://192.168.1.42/          (use your real IP, and :PORT if not 80)
   ```

   If you want a friendlier name instead of an IP, you can add an entry to
   each device's hosts file, or set up a local DNS/router hostname — that's
   optional and not required for this to work.

---

## Upgrading an existing install

If you already have this running on IIS and are just dropping in the
updated files:

1. Stop the site in IIS Manager (or just recycle the app pool).
2. Replace the project files with the new ones — **keep your existing
   `data\` folder and `.env` file**, don't overwrite them. Your accounts,
   todos, and settings all live in `data\dashboard.db` and carry over
   automatically; the app adds the new notepad/calendar tables to that
   same file the first time it starts back up.
3. Run `npm install --omit=dev` again in the project folder, since a couple
   of things changed there too.
4. Start the site again.

One note: the dashboard now *defaults* new accounts to a 12-hour clock, but
that only applies to accounts created from now on — anyone who registered
before this update keeps whatever was already saved for them. If you want
your existing account to switch to 12-hour, just open **Customize** and
change it there.

## 6. First run

Open the site and **register the first account** — it's automatically made
an **admin**. Everyone who registers after that is a normal user. Admins get
an extra **Admin** link in their ticker bar to:

- Post one-time or daily-recurring reminders/updates (shown to everyone)
- Set the shared weather location
- See the list of registered accounts

**To promote another existing user to admin later**, there's no button for
it yet — stop the site, open `data\dashboard.db` with a tool like
[DB Browser for SQLite](https://sqlitebrowser.org/), and run:

```sql
UPDATE users SET is_admin = 1 WHERE username = 'their-username';
```

---

## Where everything is stored

| What | Where |
|---|---|
| Accounts, todos, settings, broadcasts | `data\dashboard.db` |
| Login sessions | `data\sessions.db` |
| Uploaded background images | `public\uploads\<user id>\` |

To back up the whole app, just copy the `data\` and `public\uploads\`
folders somewhere safe. To reset everything, stop the site and delete
`data\dashboard.db*` and `data\sessions.db*` — they'll be recreated empty
on next start.

---

## Testing locally before touching IIS (optional)

You can run this on any machine with Node installed, no IIS needed, to try
it out first:

```powershell
npm install
copy .env.example .env
node server.js
```

Then open `http://localhost:3000/` in a browser.

---

## Notes & limitations

- **Weather** comes from the free [Open-Meteo](https://open-meteo.com) API
  (no account/key needed) and is cached for ~20 minutes and shared across
  all users, so it's not re-fetched per person.
- **Sessions** last 30 days by default (see `maxAge` in `server.js`) and are
  stored in `data\sessions.db`, so they survive an IIS/app-pool restart.
- This is built for trusted home/office network use. If you ever expose it
  to the public internet, put it behind HTTPS first (a reverse proxy like
  IIS + a certificate, or a service like Caddy) and set `COOKIE_SECURE=true`
  in `.env`.
- Background image uploads are capped at 8 MB (adjustable in
  `routes/dashboard.js` and `web.config`).
