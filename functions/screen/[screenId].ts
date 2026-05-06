import {
  escapeHtml,
  json,
  scalarParam,
  type Env,
} from "../lib/shared";
import { getScreenState } from "../lib/screens";

export const onRequest: PagesFunction<Env, "screenId"> = async (context) => {
  if (context.request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const screenId = scalarParam(context.params.screenId);
  const state = await getScreenState(context.env, screenId);

  if (!state) {
    return json({ error: "棚前ディスプレイが見つかりません。" }, { status: 404 });
  }

  return new Response(renderScreenPage(screenId, state.screen.name), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self' wss: ws:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};

function renderScreenPage(screenId: string, screenName: string) {
  const encodedScreenId = JSON.stringify(screenId);

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="format-detection" content="telephone=no" />
    <title>${escapeHtml(screenName)} | kazashiteGO Screen</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07100a;
        --ink: #fffaf0;
        --muted: rgba(255, 250, 240, 0.72);
        --accent: #ffc642;
        --green: #29a767;
      }

      * { box-sizing: border-box; }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        color: var(--ink);
        background: var(--bg);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        position: relative;
        width: 100vw;
        height: 100vh;
        background: #0d150e;
      }

      .media,
      .shade,
      .shine,
      .copy,
      .status,
      .countdown {
        position: absolute;
      }

      .media {
        inset: 0;
        overflow: hidden;
      }

      .media img,
      .media video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scale(1.04);
        animation: slowZoom 12s ease-in-out infinite alternate;
      }

      .shade {
        inset: 0;
        background:
          linear-gradient(90deg, rgba(5, 12, 7, 0.84) 0%, rgba(5, 12, 7, 0.32) 44%, rgba(5, 12, 7, 0.08) 100%),
          linear-gradient(180deg, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0.44) 100%);
      }

      .shine {
        left: -28vw;
        top: 20vh;
        width: 160vw;
        height: 12vh;
        transform: rotate(-8deg);
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.38), transparent);
        animation: sweep 4.8s ease-in-out infinite;
        mix-blend-mode: screen;
      }

      .copy {
        left: clamp(24px, 5vw, 72px);
        bottom: clamp(28px, 7vh, 92px);
        display: grid;
        gap: clamp(12px, 2.2vh, 22px);
        width: min(760px, 78vw);
        z-index: 2;
      }

      .eyebrow {
        width: fit-content;
        border: 1px solid rgba(255, 255, 255, 0.26);
        border-radius: 999px;
        padding: 9px 16px;
        color: #102017;
        background: var(--accent);
        font-size: clamp(0.78rem, 1.5vw, 1rem);
        font-weight: 900;
        letter-spacing: 0;
      }

      h1,
      p {
        margin: 0;
      }

      h1 {
        font-size: clamp(3.2rem, 8vw, 8rem);
        line-height: 0.92;
        letter-spacing: 0;
        text-wrap: balance;
        text-shadow: 0 8px 36px rgba(0, 0, 0, 0.48);
      }

      p {
        max-width: 680px;
        color: var(--muted);
        font-size: clamp(1.1rem, 2.2vw, 2rem);
        font-weight: 750;
        line-height: 1.45;
      }

      .status {
        top: 18px;
        right: 18px;
        z-index: 3;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        color: rgba(255, 255, 255, 0.86);
        background: rgba(0, 0, 0, 0.36);
        font-size: 0.82rem;
        font-weight: 800;
      }

      .status i {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #e8504f;
        box-shadow: 0 0 18px currentColor;
      }

      .status.connected i {
        background: var(--green);
      }

      .countdown {
        right: clamp(20px, 4vw, 54px);
        bottom: clamp(22px, 5vh, 58px);
        z-index: 3;
        color: rgba(255, 255, 255, 0.84);
        font-size: clamp(1rem, 2vw, 1.4rem);
        font-weight: 900;
      }

      main.switching .copy {
        animation: punch 760ms ease-out both;
      }

      @keyframes slowZoom {
        from { transform: scale(1.02) translateY(0); }
        to { transform: scale(1.09) translateY(-1.6vh); }
      }

      @keyframes sweep {
        0%, 40% { transform: translateX(-22vw) rotate(-8deg); opacity: 0; }
        56% { opacity: 1; }
        100% { transform: translateX(24vw) rotate(-8deg); opacity: 0; }
      }

      @keyframes punch {
        from { transform: translateY(24px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    </style>
  </head>
  <body>
    <main id="screen">
      <div class="media" id="media"></div>
      <div class="shade"></div>
      <div class="shine"></div>
      <section class="copy">
        <span class="eyebrow" id="eyebrow">kazashiteGO Screen</span>
        <h1 id="title">読み込み中</h1>
        <p id="description">棚前ディスプレイを準備しています。</p>
      </section>
      <div class="status" id="status"><i></i><span>接続準備中</span></div>
      <div class="countdown" id="countdown"></div>
    </main>

    <script>
      const screenId = ${encodedScreenId};
      const screen = document.getElementById("screen");
      const media = document.getElementById("media");
      const eyebrow = document.getElementById("eyebrow");
      const title = document.getElementById("title");
      const description = document.getElementById("description");
      const status = document.getElementById("status");
      const countdown = document.getElementById("countdown");
      let idleState = null;
      let returnTimer = null;
      let countdownTimer = null;
      let reconnectTimer = null;

      async function loadInitialState() {
        const response = await fetch("/api/screen/" + encodeURIComponent(screenId) + "/state", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("screen state unavailable");
        }

        const state = await response.json();
        idleState = state.current.kind === "idle" ? state.current : null;
        renderPayload(state.current, false);
      }

      function connectSocket() {
        clearTimeout(reconnectTimer);
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(protocol + "//" + location.host + "/api/screen/" + encodeURIComponent(screenId) + "/socket");

        socket.addEventListener("open", () => {
          setConnected(true, "リアルタイム接続中");
          socket.send("ping");
        });

        socket.addEventListener("message", (event) => {
          if (event.data === "pong") {
            return;
          }

          const message = JSON.parse(event.data);

          if (message.type === "screen:switch" || message.type === "screen:state") {
            renderPayload(message.payload, message.type === "screen:switch");
          }
        });

        socket.addEventListener("close", () => {
          setConnected(false, "再接続中");
          reconnectTimer = setTimeout(connectSocket, 1200);
        });

        socket.addEventListener("error", () => {
          setConnected(false, "接続を確認中");
        });
      }

      function renderPayload(payload, animate) {
        if (payload.kind === "idle") {
          idleState = payload;
        }

        clearTimeout(returnTimer);
        clearInterval(countdownTimer);
        media.innerHTML = "";
        title.textContent = payload.title;
        description.textContent = payload.description;
        eyebrow.textContent = payload.kind === "campaign" ? "NFC連動広告" : "棚前サイネージ";
        countdown.textContent = "";

        const element = payload.mediaType === "video"
          ? document.createElement("video")
          : document.createElement("img");

        element.src = payload.mediaPath;

        if (payload.mediaType === "video") {
          element.autoplay = true;
          element.muted = true;
          element.loop = true;
          element.playsInline = true;
        } else {
          element.alt = payload.title;
        }

        media.appendChild(element);

        if (animate) {
          screen.classList.remove("switching");
          void screen.offsetWidth;
          screen.classList.add("switching");
        }

        if (payload.kind === "campaign" && payload.expiresAt) {
          startReturnTimer(payload.expiresAt);
        }
      }

      function startReturnTimer(expiresAt) {
        const update = () => {
          const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
          countdown.textContent = remaining > 0 ? remaining + "秒後に通常表示へ戻ります" : "";

          if (remaining <= 0) {
            clearInterval(countdownTimer);
          }
        };

        update();
        countdownTimer = setInterval(update, 500);
        returnTimer = setTimeout(() => {
          if (idleState) {
            renderPayload(idleState, true);
          }
        }, Math.max(0, Date.parse(expiresAt) - Date.now()));
      }

      function setConnected(connected, label) {
        status.classList.toggle("connected", connected);
        status.querySelector("span").textContent = label;
      }

      loadInitialState()
        .then(connectSocket)
        .catch(() => {
          setConnected(false, "初期化エラー");
        });
    </script>
  </body>
</html>`;
}
