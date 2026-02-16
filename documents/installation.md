# Installation — Etsy Sales Manager

This guide covers installing and running the Etsy Sales Manager app on **macOS** and **Windows 11**. Use the steps that match your OS where they differ.

---

## 1. Prerequisites

### Node.js and npm

The app needs **Node.js** (LTS recommended) and **npm** (included with Node).

| Step                   | macOS                                                                        | Windows 11                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Check**              | Open **Terminal**, run: `node -v` and `npm -v`                               | Open **PowerShell** or **Command Prompt**, run: `node -v` and `npm -v`                                                |
| **Install if missing** | Use [nodejs.org](https://nodejs.org/) (LTS) or Homebrew: `brew install node` | Download the **LTS** installer from [nodejs.org](https://nodejs.org/) and run it. Restart the terminal after install. |

You need at least **Node 18** (20 LTS or 22 LTS is fine).

### Git (optional)

Only needed if you clone the repo. If you use a ZIP download, you can skip Git.

| Step                   | macOS                                                                  | Windows 11                                                              |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Check**              | In Terminal: `git --version`                                           | In PowerShell/CMD: `git --version`                                      |
| **Install if missing** | `brew install git` or install from [git-scm.com](https://git-scm.com/) | Install from [git-scm.com](https://git-scm.com/) (use default options). |

---

## 2. Get the project

Choose one:

- **From Git:**  
  `git clone <repository-url> etsy`  
  then `cd etsy`.

- **From ZIP:**  
  Unzip the project into a folder (e.g. `etsy`), then open a terminal in that folder (e.g. `cd C:\Users\YourName\etsy` on Windows, or `cd ~/etsy` on Mac).

Your current directory should be the project root (where `package.json` and `system/` exist).

---

## 3. Windows only: ensure config files at root

On **Windows**, symlinks from the project root to `system/` may not work. If you get errors like “cannot find module” or “package.json not found” when running `npm install` or `npm run dev`, copy the system files to the root:

1. Open the project folder in File Explorer.
2. Go into the **system** folder.
3. Copy these files **into the project root** (the folder that contains `system`):
   - `package.json`
   - `package-lock.json`
   - `next.config.ts`
   - `tsconfig.json`
   - `eslint.config.mjs`
   - `postcss.config.mjs`

If any file in this list does not exist in `system/`, skip that file.

Do **not** remove them from `system/`; having copies at root is fine. After this, `npm install` and `npm run dev` should run from the root.

On **macOS**, the root usually has symlinks to these files; you don’t need to copy unless something is broken.

---

## 4. Etsy app registration

Same on both platforms:

1. Go to [Etsy Developers](https://www.etsy.com/developers/register) and sign in with your Etsy account.
2. Create a new app (or use an existing one).
3. In the app settings, note:
   - **API Key (keystring)** → you’ll use this as `ETSY_CLIENT_ID`
   - **Shared Secret** → you’ll use this as `ETSY_CLIENT_SECRET`
4. Under **Redirect URI**, add:
   - **Local:** `http://localhost:3000/api/auth/etsy/callback`
   - For a live site later: `https://your-domain.com/api/auth/etsy/callback`

Save the app settings.

---

## 5. Environment variables

Create a local env file from the template and add your Etsy credentials.

| Step                                | macOS                         | Windows 11 |
| ----------------------------------- | ----------------------------- | ---------- |
| **Copy template**                   | In Terminal (project root):   |
| `cp system/.env.example .env.local` | In PowerShell (project root): |

`Copy-Item system\.env.example .env.local`  
 Or in Command Prompt:  
 `copy system\.env.example .env.local` |
| **Edit** | Open `.env.local` in any text editor. | Open `.env.local` in Notepad or another editor (e.g. VS Code). |

Set these in `.env.local` (no quotes unless the value contains spaces):

```env
ETSY_CLIENT_ID=your_keystring_from_etsy
ETSY_CLIENT_SECRET=your_shared_secret_from_etsy
ETSY_REDIRECT_URI=http://localhost:3000/api/auth/etsy/callback
# Optional: some Etsy setups require x-api-key as keystring:sharedsecret
# ETSY_API_KEY_HEADER=your_keystring:your_shared_secret
```

Save the file. Do not commit `.env.local`; it is ignored by Git.

---

## 6. Install dependencies

In the project root:

| macOS         | Windows 11    |
| ------------- | ------------- |
| `npm install` | `npm install` |

Use the same terminal/PowerShell/CMD window you used above. Wait until it finishes without errors.

---

## 7. Run the app

| macOS         | Windows 11    |
| ------------- | ------------- |
| `npm run dev` | `npm run dev` |

You should see something like:

```text
▲ Next.js 16.x.x
- Local:        http://localhost:3000
```

1. Open a browser and go to **http://localhost:3000**
2. Click **Connect Etsy**
3. Sign in with your Etsy shop account and approve access
4. You should return to the app and see your shop(s) and recent orders

To stop the app: in the terminal, press **Ctrl+C**.

---

## 8. Troubleshooting

| Issue                                   | What to try                                                                                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`node` or `npm` not found**           | Install Node.js LTS from [nodejs.org](https://nodejs.org/) and restart the terminal. On Windows, close and reopen PowerShell/CMD after installing.                                                              |
| **`npm install` fails**                 | Make sure you’re in the project root (folder that has `package.json` or `system/`). On Windows, if you see path or permission errors, run the copy step in **Section 3** so that `package.json` is at the root. |
| **`npm run dev` fails**                 | Same as above: ensure `next.config.ts` and `package.json` are at the project root. On Windows, copy from `system/` if needed.                                                                                   |
| **“Missing ETSY_CLIENT_ID…”**           | Create `.env.local` from `system/.env.example` and set `ETSY_CLIENT_ID`, `ETSY_CLIENT_SECRET`, and `ETSY_REDIRECT_URI`. Restart `npm run dev` after changing `.env.local`.                                      |
| **OAuth works but Etsy API calls fail** | Set `ETSY_API_KEY_HEADER=your_keystring:your_shared_secret` in `.env.local` if your app key must be sent in that header format. Keep `ETSY_CLIENT_ID` as your OAuth client id.                                  |
| **Etsy “redirect_uri_mismatch”**        | In your Etsy app settings, the redirect URI must be exactly `http://localhost:3000/api/auth/etsy/callback` (no trailing slash, `http` for local).                                                               |
| **Port 3000 in use**                    | Stop the other app using port 3000, or run on another port: `npm run dev -- -p 3001` and open http://localhost:3001.                                                                                            |

---

## 9. First-day operation check (after install)

After installation succeeds, run this quick operator verification:

1. Open dashboard and confirm it loads without errors.
2. Click **Connect Etsy** and complete OAuth.
3. Confirm:
   - connection badge shows connected,
   - shop selector appears,
   - recent orders table loads.
4. Switch to another shop (if available) and confirm order list refreshes.
5. Click **Disconnect** and verify UI returns to not-connected state.
6. Reconnect once more to confirm stable sign-in.

If any step fails, follow the in-app error actions first, then use Section 8 troubleshooting.

---

## Summary (quick reference)

| Step | Action                                                                                    |
| ---- | ----------------------------------------------------------------------------------------- |
| 1    | Install Node.js LTS (and Git if cloning).                                                 |
| 2    | Get the project (clone or unzip) and `cd` to its root.                                    |
| 3    | **Windows:** If needed, copy `system/` config files to root.                              |
| 4    | Register an Etsy app and add redirect URI `http://localhost:3000/api/auth/etsy/callback`. |
| 5    | Copy `system/.env.example` to `.env.local` and add your Etsy keys.                        |
| 6    | Run `npm install`.                                                                        |
| 7    | Run `npm run dev` and open http://localhost:3000.                                         |

Same flow on both Mac and Windows 11; only the copy command and Windows “copy system to root” step differ where noted.
