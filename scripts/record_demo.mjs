import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = "/tmp/synapse_recording";
const FRAMES_DIR = path.join(OUTPUT_DIR, "frames");

if (!fs.existsSync(FRAMES_DIR)) {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

let frameCount = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(msg.error);
          else cb.resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async captureFrame(namePrefix = "frame") {
    const res = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    frameCount++;
    const frameNum = String(frameCount).padStart(5, "0");
    const filePath = path.join(FRAMES_DIR, `${namePrefix}_${frameNum}.png`);
    fs.writeFileSync(filePath, Buffer.from(res.data, "base64"));
    return filePath;
  }

  async captureSequence(durationMs, fps = 10, namePrefix = "frame") {
    const interval = Math.max(50, Math.floor(1000 / fps));
    const count = Math.floor(durationMs / interval);
    for (let i = 0; i < count; i++) {
      await this.captureFrame(namePrefix);
      await sleep(interval);
    }
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }
}

async function main() {
  console.log("=== SYNAPSE HEALER AUTOMATED DEMO RECORDER ===");
  console.log("1. Launching Chromium headless browser on port 9222...");

  // Launch Chromium
  const chrome = spawn(
    "chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=9222",
      "--window-size=1920,1080",
      "--user-data-dir=/tmp/synapse_chrome_rec",
      "http://localhost:3000",
    ],
    { stdio: "ignore" }
  );

  // Wait for remote debugging to be ready
  let target = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch("http://localhost:9222/json/list");
      const list = await res.json();
      target = list.find((t) => t.type === "page" && t.url.includes("3000"));
      if (target) break;
    } catch {}
  }

  if (!target) {
    console.error("Failed to connect to Chromium debug target.");
    chrome.kill();
    process.exit(1);
  }

  console.log(`2. Connected to target: ${target.webSocketDebuggerUrl}`);
  const client = new CDPClient(target.webSocketDebuggerUrl);
  await client.connect();

  await client.send("Page.enable");
  await client.send("DOM.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Ensure page is loaded
  await sleep(2000);

  console.log("3. Recording Scene 1: Executive Overview & Bento Matrix...");
  await client.captureSequence(2500, 10, "scene1_overview");

  console.log("4. Recording Scene 2: Scenario 1 (HL7 PV1/PID Inversion)...");
  // Click scenario 1 simulate button
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const simBtn = btns.find(b => b.textContent && b.textContent.includes('Simulate'));
      if (simBtn) simBtn.click();
    })()
  `);
  // Capture injection transition and healed result
  await client.captureSequence(3500, 10, "scene2_scenario1");

  console.log("5. Recording Scene 3: Scenario 4 (JSON Quoted Numbers & Type Coercion)...");
  await client.evaluate(`
    (() => {
      const cards = Array.from(document.querySelectorAll('h3'));
      const card = cards.find(h => h.textContent && h.textContent.includes('JSON Quoted Numbers'));
      if (card) {
        const container = card.closest('.group');
        const btn = container ? container.querySelector('button') : null;
        if (btn) btn.click();
      }
    })()
  `);
  await client.captureSequence(3500, 10, "scene3_scenario4");

  console.log("6. Recording Scene 4: Scenario 2 (HL7 Invalid Date -> Human Workflow Escalation)...");
  await client.evaluate(`
    (() => {
      const cards = Array.from(document.querySelectorAll('h3'));
      const card = cards.find(h => h.textContent && h.textContent.includes('HL7 Invalid Calendar Date'));
      if (card) {
        const container = card.closest('.group');
        const btn = container ? container.querySelector('button') : null;
        if (btn) btn.click();
      }
    })()
  `);
  await client.captureSequence(3500, 10, "scene4_scenario2");

  console.log("7. Recording Scene 5: Human Workflow Review Queue Interaction...");
  // Scroll down to tabs
  await client.evaluate(`window.scrollTo({ top: 650, behavior: 'smooth' });`);
  await sleep(600);

  // Click Human Workflow Queue tab
  await client.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const qTab = tabs.find(b => b.textContent && b.textContent.includes('Human Workflow Queue'));
      if (qTab) qTab.click();
    })()
  `);
  await client.captureSequence(1500, 10, "scene5_tab_queue");

  // Expand payload inspection
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const inspBtn = btns.find(b => b.textContent && b.textContent.includes('Inspect Payload Comparison'));
      if (inspBtn) inspBtn.click();
    })()
  `);
  await client.captureSequence(2000, 10, "scene5_inspect");

  // Type reviewer notes
  await client.evaluate(`
    (() => {
      const inputs = Array.from(document.querySelectorAll('input[placeholder*="Operator reviewer notes"]'));
      if (inputs.length > 0) {
        inputs[0].value = 'Validated PID patient record against master MPI. Approved by contest judge.';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await client.captureSequence(1500, 10, "scene5_note");

  // Click Approve & Dispatch
  await client.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const appBtn = btns.find(b => b.textContent && b.textContent.includes('Approve & Dispatch'));
      if (appBtn) appBtn.click();
    })()
  `);
  await client.captureSequence(2500, 10, "scene5_approved");

  console.log("8. Recording Scene 6: IRIS Vector Search 384-dim Runbooks...");
  // Click RAG tab
  await client.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const ragTab = tabs.find(b => b.textContent && b.textContent.includes('IRIS Vector Search Runbooks'));
      if (ragTab) ragTab.click();
    })()
  `);
  await client.captureSequence(2000, 10, "scene6_rag_tab");

  // Filter runbooks with search
  await client.evaluate(`
    (() => {
      const search = document.querySelector('input[placeholder*="Filter runbooks"]');
      if (search) {
        search.value = 'PID';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await client.captureSequence(2000, 10, "scene6_rag_filter");

  console.log("9. Recording Scene 7: Live Audit Telemetry Ledger...");
  // Click Telemetry tab
  await client.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const telTab = tabs.find(b => b.textContent && b.textContent.includes('Live Audit Telemetry'));
      if (telTab) telTab.click();
    })()
  `);
  await client.captureSequence(2500, 10, "scene7_telemetry");

  // Scroll back to top for closing view
  await client.evaluate(`window.scrollTo({ top: 0, behavior: 'smooth' });`);
  await sleep(600);
  await client.captureSequence(2000, 10, "scene8_closing");

  console.log(`Recording complete! Total frames captured: ${frameCount}`);
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
