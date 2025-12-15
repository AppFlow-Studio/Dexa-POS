/**
 * Debug Server for POS Sync Data
 *
 * Run this during development to capture sync data:
 * node scripts/debug-server.js
 *
 * The app will POST sync data here, and it will be saved to:
 * ./debug/pos_sync_data.json
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3456;
const DEBUG_DIR = path.join(__dirname, "..", "debug");
const OUTPUT_FILE = path.join(DEBUG_DIR, "pos_sync_data.json");

// Ensure debug directory exists
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/debug/sync-data") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const prettyJson = JSON.stringify(data, null, 2);

        fs.writeFileSync(OUTPUT_FILE, prettyJson);

        console.log("\n✅ Sync data saved to:", OUTPUT_FILE);
        console.log("📊 Menus:", data.menus?.length || 0);
        console.log("📅 Synced at:", data.synced_at);
        console.log("📍 Location:", data.location_id);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, path: OUTPUT_FILE }));
      } catch (error) {
        console.error("❌ Error saving data:", error.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Debug server running at http://localhost:${PORT}`);
  console.log(`📁 Data will be saved to: ${OUTPUT_FILE}`);
  console.log("\nWaiting for sync data from the app...\n");
});
