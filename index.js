const express = require("express");
const https   = require("https");
const app     = express();

app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Другий бот тільки для синхронізації
const SYNC_BOT_TOKEN = "8609877147:AAGB1D63fOsFz2qs1dckRG1e2VCeeaYwM00";
const DATA_TAG       = "SIMON_DATA_V1";
const OWNER_ID       = 1739408129;

let cachedData  = null;
let lastUpdate  = 0;
let lastOffset  = 0;

function tgRequest(token, method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(params);
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${token}/${method}`,
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

async function syncData() {
  try {
    const result = await tgRequest(SYNC_BOT_TOKEN, "getUpdates", {
      offset: lastOffset,
      limit: 100,
      timeout: 0
    });

    if (!result.ok || !result.result.length) return false;

    let found = false;
    for (const upd of result.result) {
      lastOffset = upd.update_id + 1;
      const msg = upd.message;
      if (!msg || !msg.text) continue;
      if (msg.text.startsWith(DATA_TAG)) {
        const jsonStr = msg.text.substring(DATA_TAG.length).trim();
        try {
          cachedData = JSON.parse(jsonStr);
          lastUpdate = Date.now();
          found = true;
          console.log("✅ Synced! Players:", cachedData.total_players, new Date().toISOString());
        } catch(e) {
          console.error("JSON parse error:", e.message);
        }
      }
    }
    return found;
  } catch(e) {
    console.error("Sync error:", e.message);
    return false;
  }
}

// Синхронізуємо кожні 15 секунд
syncData();
setInterval(syncData, 15000);

app.get("/data", (req, res) => {
  if (!cachedData) {
    return res.status(404).json({ ok: false, error: "No data yet. Write /start to bot." });
  }
  res.json({ ok: true, data: cachedData, updated: lastUpdate });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, has_data: !!cachedData, updated: lastUpdate, offset: lastOffset });
});

app.get("/sync", async (req, res) => {
  const ok = await syncData();
  res.json({ ok, has_data: !!cachedData, updated: lastUpdate });
});

app.get("/debug", async (req, res) => {
  try {
    const result = await tgRequest(SYNC_BOT_TOKEN, "getUpdates", {
      offset: 0,
      limit: 5
    });
    res.json(result);
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.listen(3000, () => console.log("Simon proxy v4 running with sync bot"));
