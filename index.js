const express = require("express");
const https   = require("https");
const app     = express();

app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

const BOT_TOKEN = "8268677697:AAF2dRwMDrHaopeXU5S2Dt42vDuto4mJD5Q";
const DATA_TAG  = "SIMON_DATA_V1";

let cachedData = null;
let lastUpdate = 0;
let lastMsgId  = null;

function tgRequest(method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function syncFromChannel() {
  try {
    // Метод 1: getUpdates з channel_post
    const result = await tgRequest("getUpdates", {
      limit: 100,
      allowed_updates: ["channel_post", "message"]
    });

    if (result.ok && result.result && result.result.length > 0) {
      for (let i = result.result.length - 1; i >= 0; i--) {
        const upd  = result.result[i];
        const post = upd.channel_post || upd.message;
        if (post && post.text && post.text.startsWith(DATA_TAG)) {
          const jsonStr = post.text.substring(DATA_TAG.length).trim();
          cachedData = JSON.parse(jsonStr);
          lastUpdate = Date.now();
          lastMsgId  = post.message_id;
          console.log("✅ Synced! Players:", cachedData.total_players,
            "at", new Date().toISOString());
          return true;
        }
      }
      console.log("No SIMON_DATA_V1 found in", result.result.length, "updates");
      console.log("Sample:", JSON.stringify(result.result[0]).substring(0, 200));
    } else {
      console.log("getUpdates result:", JSON.stringify(result).substring(0, 300));
    }
    return false;
  } catch(e) {
    console.error("Sync error:", e.message);
    return false;
  }
}

// Синхронізуємо кожні 30 секунд
syncFromChannel();
setInterval(syncFromChannel, 30000);

app.get("/data", (req, res) => {
  if (!cachedData) {
    return res.status(404).json({ ok: false, error: "No data yet" });
  }
  res.json({ ok: true, data: cachedData, updated: lastUpdate });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, has_data: !!cachedData, updated: lastUpdate, last_msg_id: lastMsgId });
});

app.get("/sync", async (req, res) => {
  const ok = await syncFromChannel();
  res.json({ ok, has_data: !!cachedData, updated: lastUpdate });
});

// Діагностика — показує що приходить від Telegram
app.get("/debug", async (req, res) => {
  try {
    const result = await tgRequest("getUpdates", {
      limit: 5,
      allowed_updates: ["channel_post", "message"]
    });
    res.json(result);
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.listen(3000, () => console.log("Simon proxy v3 running"));
