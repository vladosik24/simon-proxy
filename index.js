const express = require("express");
const https   = require("https");
const app     = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

const BOT_TOKEN  = "8268677697:AAF2dRwMDrHaopeXU5S2Dt42vDuto4mJD5Q";
const CHANNEL_ID = "@SimonUkraine";
const DATA_TAG   = "SIMON_DATA_V1";

let cachedData = null;
let lastUpdate = 0;

// Telegram API запит
function tgGet(method, params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}?${query}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// Читаємо останнє повідомлення з каналу з тегом SIMON_DATA_V1
async function syncFromChannel() {
  try {
    const result = await tgGet("getUpdates", {
      limit: 10,
      allowed_updates: "channel_post"
    });

    if (!result.ok || !result.result.length) return;

    // Шукаємо повідомлення з тегом
    for (let i = result.result.length - 1; i >= 0; i--) {
      const post = result.result[i].channel_post;
      if (post && post.chat && post.chat.username === "SimonUkraine" &&
          post.text && post.text.startsWith(DATA_TAG)) {
        const jsonStr = post.text.replace(DATA_TAG + "\n", "");
        cachedData = JSON.parse(jsonStr);
        lastUpdate = Date.now();
        console.log("Synced from channel:", new Date().toISOString(),
          "players:", cachedData.total_players);
        break;
      }
    }
  } catch(e) {
    console.error("Sync error:", e.message);
  }
}

// Синхронізуємо кожні 30 секунд
syncFromChannel();
setInterval(syncFromChannel, 30000);

// ===== GET /data =====
app.get("/data", (req, res) => {
  if (!cachedData) {
    return res.status(404).json({
      ok: false,
      error: "No data yet. Write /start to bot first."
    });
  }
  res.json({ ok: true, data: cachedData, updated: lastUpdate });
});

// ===== GET /health =====
app.get("/health", (req, res) => {
  res.json({ ok: true, has_data: !!cachedData, updated: lastUpdate });
});

// ===== GET /sync — примусова синхронізація =====
app.get("/sync", async (req, res) => {
  await syncFromChannel();
  res.json({ ok: true, has_data: !!cachedData, updated: lastUpdate });
});

app.listen(3000, () => console.log("Simon proxy v2 running"));
