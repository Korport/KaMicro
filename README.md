# Trivia! — Real-time Multiplayer Quiz

Kahoot-style trivia game. One browser tab on a big screen (host), phones as controllers.

---

## Socket.IO Event Contract

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `host:create_room` | `{}` | Host creates a new room |
| `host:reconnect` | `{ roomCode, hostToken }` | Host reconnects after page reload |
| `host:start_game` | `{ roomCode, hostToken, questions[], timeLimit }` | Start the game |
| `host:advance` | `{ roomCode, hostToken }` | Skip timer (in question) or go to next question (in reveal) |
| `player:join` | `{ roomCode, nickname, playerId? }` | Join or rejoin a room |
| `player:answer` | `{ answer: 'a'\|'b'\|'c'\|'d' }` | Submit answer |

### Server → Client

| Event | Payload | To |
|---|---|---|
| `room:created` | `{ roomCode, qrCode, hostToken }` | host socket |
| `host:reconnected` | `{ roomCode, qrCode, phase, players[], questionCount }` | host socket |
| `host:reconnect_failed` | `{}` | host socket |
| `room:player_joined` | `{ players[] }` | host socket |
| `room:player_left` | `{ playerId, players[] }` | host socket |
| `player:joined` | `{ playerId, nickname, players[], phase }` | joining player |
| `player:answer_locked` | `{ answer }` | answering player |
| `game:answer_count` | `{ answered, total }` | host socket |
| `game:started` | `{ questionCount }` | room broadcast |
| `game:question` | `{ questionIndex, totalQuestions, question, answers:{a,b,c,d}, gifUrl, timeLimit }` | room broadcast |
| `game:timer_tick` | `{ remaining }` | room broadcast |
| `game:reveal` | `{ correct, distribution:{a,b,c,d}, leaderboard[] }` | room broadcast |
| `player:result` | `{ isCorrect, delta, score }` | individual player |
| `game:end` | `{ leaderboard[] }` | room broadcast |
| `error` | `{ message }` | relevant socket |

### Scoring formula

```
BASE_POINTS     = 1000
SPEED_BONUS_MAX = 500

Correct answer:
  speedBonus = round(SPEED_BONUS_MAX × max(0, 1 − elapsed_ms / (timeLimit_s × 1000)))
  delta = BASE_POINTS + speedBonus   # range: 1000 – 1500

Wrong / no answer:
  delta = 0
```

---

## Project Structure

```
trivia-game/
├── Dockerfile              # Multi-stage: builds client, runs server
├── docker-compose.yml      # app (Node) + caddy (HTTPS reverse proxy)
├── Caddyfile               # Automatic HTTPS, WebSocket proxy
├── .env.example            # Copy to .env and fill in
├── questions.csv           # 5-row sample
├── .github/
│   └── workflows/
│       └── deploy.yml      # Push-to-main → SSH deploy to Azure VM
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js            # Express + Socket.IO entrypoint
│       ├── gameManager.js      # In-memory game state & scoring
│       ├── socketHandlers.js   # All socket event handlers
│       └── utils/qr.js         # QR code generator (qrcode npm)
└── client/
    ├── package.json
    ├── vite.config.js          # Dev proxy: /socket.io → :3001
    ├── index.html
    └── src/
        ├── App.jsx             # Routes: / | /host | /settings | /join/:code
        ├── socket.js           # Shared socket.io-client instance
        ├── views/
        │   ├── LandingPage.jsx     # Enter room code or go to /host
        │   ├── HostScreen.jsx      # Big screen: lobby → question → reveal → end
        │   ├── SettingsPage.jsx    # CSV upload + time limit config
        │   └── PlayerView.jsx      # Phone: join → lobby → question → result → end
        ├── components/
        │   ├── Timer.jsx           # SVG countdown ring
        │   ├── BarChart.jsx        # Answer distribution bars
        │   ├── Leaderboard.jsx     # Ranked player list
        │   ├── GifDisplay.jsx      # GIPHY gif (fails silently)
        │   └── AnswerButton.jsx    # Colored A/B/C/D button (player)
        └── styles/
            └── index.css           # Dark theme, CSS variables, responsive
```

---

## Local Development

**Prerequisites:** Node 20+

```bash
cp .env.example .env
# Edit .env — set GIPHY_API_KEY and leave DOMAIN as http://localhost:5173

# Terminal 1 — server
cd server
npm install
npm run dev       # runs on :3001

# Terminal 2 — client
cd client
npm install
npm run dev       # runs on :5173, proxies /socket.io to :3001
```

Open `http://localhost:5173/host` on your laptop (the big screen).  
Open `http://localhost:5173/join/XXXX` (replace XXXX with the room code) on your phone — or scan the QR code if your phone and laptop are on the same network and you use your LAN IP instead of localhost.

### CSV format

Upload via Settings (`/settings`). Required columns:

```csv
question,answer_a,answer_b,answer_c,answer_d,correct,giphy_keyword
```

- `correct` must be `a`, `b`, `c`, or `d`
- `giphy_keyword` is used to search GIPHY for a relevant GIF (silently skipped if API key is missing)
- See `questions.csv` for sample rows

---

## Production Deploy (Azure VM)

### 1. Prepare the VM

```bash
# On the VM (Ubuntu 22.04+)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER   # re-login after this
sudo mkdir -p /opt/trivia-game
```

Ensure ports 80 and 443 are open in the Azure Network Security Group.

### 2. Point DNS

Create an A record: `yourdomain.com → <VM public IP>`

### 3. Configure GitHub Secrets

In your repository → Settings → Secrets → Actions:

| Secret | Value |
|---|---|
| `AZURE_VM_HOST` | VM public IP or hostname |
| `AZURE_VM_USER` | SSH username (e.g. `azureuser`) |
| `AZURE_SSH_KEY` | Private SSH key (the `-----BEGIN...` block) |
| `GIPHY_API_KEY` | Your GIPHY API key |
| `DOMAIN` | `yourdomain.com` (no protocol, no trailing slash) |

The `Caddyfile` uses `{$DOMAIN}` — Caddy auto-issues a Let's Encrypt cert.

### 4. Deploy

```bash
git push origin main
```

GitHub Actions will SSH into the VM, pull the code, rebuild the Docker image, and restart the containers. First deploy takes ~3 minutes (npm installs + Docker layers); subsequent deploys are faster thanks to layer caching.

### 5. Verify

```
https://yourdomain.com/host   ← big screen
https://yourdomain.com/join/XXXX   ← phones (or scan QR)
```

---

## Architecture notes

- **In-memory only** — game state lives in a `Map` in the Node process. Restarting the server ends all active games.
- **Host auth** — a `hostToken` (random 24-char string) is issued at room creation and stored in `localStorage`. All host-privileged socket events require it. Host page reload reconnects cleanly via `host:reconnect`.
- **Player reconnect** — `playerId` is persisted in `localStorage` keyed by room code. On rejoin the server recognises the ID and updates the socket ID, preserving the score.
- **Auto-reveal** — when every connected player has answered, the server clears the countdown and immediately reveals results.
- **Max 10 players** per room (configurable in `gameManager.js`).
