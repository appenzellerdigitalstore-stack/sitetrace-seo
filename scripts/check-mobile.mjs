/**
 * Mobile layout regression check.
 *
 * Opens the site in a real browser at a real phone viewport (390 x 844) and
 * reports any element that sticks out past the viewport. An element wider
 * than the screen is what makes a page scroll sideways on a phone, which is
 * the failure mode this script exists to catch.
 *
 * It also writes a screenshot so the layout can be eyeballed.
 *
 * Usage:
 *   node scripts/check-mobile.mjs [url] [width] [height] [outPng] [full]
 *
 * Example:
 *   node scripts/check-mobile.mjs http://localhost:5199/ 390 844 .dev/mobile-landing.png
 *   node scripts/check-mobile.mjs http://localhost:5199/#/audit 390 844 .dev/mobile-audit.png full
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGET = process.argv[2] ?? "http://localhost:5199/";
const WIDTH = Number(process.argv[3] ?? 390);
const HEIGHT = Number(process.argv[4] ?? 844);
const OUT_PNG = process.argv[5] ?? ".dev/mobile.png";
/** "full" captures the whole scrollable page instead of just the viewport. */
const FULL_PAGE = (process.argv[6] ?? "").toLowerCase() === "full";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const PORT = 9333;

/** Finds the first element wider than the viewport, with a readable reason. */
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1) {
      const cls = typeof el.className === "string" ? el.className : "";
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 50),
      });
    }
  }
  return JSON.stringify({
    viewport: vw,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 30),
  });
})()`;

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("No Chrome or Edge binary found.");
}

/** Waits for the DevTools endpoint to answer. */
async function waitForDevTools(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error("DevTools endpoint never came up.");
}

function connect(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: ok, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(JSON.stringify(message.error)));
        else ok(message.result);
      }
    });
    socket.addEventListener("error", (event) => rejectPromise(new Error(String(event.message ?? "ws error"))));
    socket.addEventListener("open", () => resolvePromise(socket));

    const send = (method, params = {}) =>
      new Promise((ok, fail) => {
        const id = ++nextId;
        pending.set(id, { resolve: ok, reject: fail });
        socket.send(JSON.stringify({ id, method, params }));
      });

    socket.sendCommand = send;
  });
}

async function main() {
  const browser = findBrowser();
  const profile = resolve(PROJECT_ROOT, ".dev", "chrome-profile");
  mkdirSync(profile, { recursive: true });

  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      TARGET,
    ],
    { stdio: "ignore" },
  );

  let exitCode = 0;

  try {
    const page = await waitForDevTools();
    const socket = await connect(page.webSocketDebuggerUrl);

    await socket.sendCommand("Page.enable");
    await socket.sendCommand("Runtime.enable");
    await socket.sendCommand("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await socket.sendCommand("Page.reload", { ignoreCache: true });
    await sleep(2500);

    const probe = await socket.sendCommand("Runtime.evaluate", {
      expression: PROBE,
      returnByValue: true,
      awaitPromise: true,
    });

    const report = JSON.parse(probe.result.value);
    const overflow = report.docScrollWidth - report.viewport;

    console.log(`viewport        ${report.viewport}px`);
    console.log(`document width  ${report.docScrollWidth}px`);
    console.log(`body width      ${report.bodyScrollWidth}px`);
    console.log(`horizontal overflow: ${overflow > 1 ? `YES (+${overflow}px)` : "none"}`);

    if (report.offenders.length) {
      console.log(`\noffenders (${report.offenders.length}):`);
      for (const o of report.offenders) {
        console.log(
          `  <${o.tag}${o.cls ? ` class="${o.cls}"` : ""}> left=${o.left} right=${o.right} w=${o.width}` +
            (o.text ? `  "${o.text}"` : ""),
        );
      }
    }

    const shot = await socket.sendCommand("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: FULL_PAGE,
    });
    const outPath = resolve(PROJECT_ROOT, OUT_PNG);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(shot.data, "base64"));
    console.log(`\nscreenshot: ${outPath}`);

    if (overflow > 1) exitCode = 1;
    socket.close();
  } catch (error) {
    console.error(`check failed: ${error.message}`);
    exitCode = 2;
  } finally {
    child.kill();
  }

  process.exit(exitCode);
}

main();
