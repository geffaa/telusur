/**
 * Scripted demo recording of Telusur.
 *   API (:8000), worker and web (:3000) running, demo data seeded, GROQ_API_KEY set.
 *   cd demo && npm install && node record.mjs
 * Output: demo/out/telusur-demo.mp4
 *
 * Each scene is recorded with Puppeteer's screencast (needs ffmpeg on PATH), then the
 * clips are joined and encoded to H.264 so the file plays everywhere. Same approach as
 * the racik-shopify and kala-shopify demos.
 */
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const W = 1440;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Brand colors (sRGB approximations of the app's oklch tokens).
const C = { brand: "#0E8478", strong: "#0B625A", soft: "#E2F3F0", bg: "#F8F7F4", ink: "#1F2633", muted: "#5E6675", line: "#E7E4DD" };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  defaultViewport: null,
  args: [`--window-size=${W},${H}`, "--hide-scrollbars"],
});

/* ---------- overlay helpers (cursor + caption), injected on every page ---------- */

const OVERLAY = `
  (() => {
    if (window.__demo) return;
    window.__demo = true;
    const css = document.createElement('style');
    css.textContent = \`
      #demo-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -3px 0 0 -3px; pointer-events: none;
        transition: transform 60ms linear; }
      #demo-cursor.down { transform: scale(.82); }
      #demo-cap { position: fixed; z-index: 2147483646; left: 50%; bottom: 104px; transform: translate(-50%, 12px); opacity: 0;
        background: ${C.ink}; color: #fff; font: 600 15px/1.4 system-ui, -apple-system, sans-serif; border-radius: 999px;
        padding: 12px 20px 11px; max-width: 820px; text-align: center; pointer-events: none;
        transition: opacity 240ms ease, transform 240ms ease; box-shadow: 0 10px 30px rgba(0,0,0,.18); }
      #demo-cap.on { opacity: 1; transform: translate(-50%, 0); }
      #demo-cap b { color: #7FE0D2; font-weight: 700; }
    \`;
    const add = () => {
      document.head.appendChild(css);
      const c = document.createElement('div');
      c.id = 'demo-cursor';
      c.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M3 2l15 9-7 1.6L7.5 20z" fill="${C.ink}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      const cap = document.createElement('div');
      cap.id = 'demo-cap';
      document.body.append(c, cap);
      const pos = JSON.parse(sessionStorage.getItem('demo-pos') || '[720,450]');
      c.style.left = pos[0] + 'px'; c.style.top = pos[1] + 'px';
      addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; sessionStorage.setItem('demo-pos', JSON.stringify([e.clientX, e.clientY])); }, true);
      addEventListener('mousedown', () => c.classList.add('down'), true);
      addEventListener('mouseup', () => c.classList.remove('down'), true);
      // Radix portals append dialogs to <body>; keep the overlay last so it stays on top.
      new MutationObserver(() => { if (document.body.lastElementChild !== cap) document.body.append(c, cap); })
        .observe(document.body, { childList: true });
    };
    if (document.body) add(); else addEventListener('DOMContentLoaded', add);
  })();
`;

const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(OVERLAY);

async function caption(html, hold = 0) {
  await page.evaluate((h) => {
    const cap = document.getElementById("demo-cap");
    if (!cap) return;
    if (!h) return cap.classList.remove("on");
    cap.innerHTML = h;
    cap.classList.add("on");
  }, html);
  if (hold) await sleep(hold);
}

let mouse = { x: 720, y: 450 };
async function moveTo(x, y, steps = 28) {
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(12);
  }
  mouse = { x, y };
}

/** Center of the first element matching `selector` (and containing `text`, if given). */
async function locate(selector, text) {
  await page.waitForFunction(
    (s, t) => [...document.querySelectorAll(s)].some((el) => !t || el.textContent.includes(t)),
    { timeout: 60000 },
    selector,
    text ?? null,
  );
  const moved = await page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => !t || e.textContent.includes(t));
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.bottom <= innerHeight) return false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    },
    selector,
    text ?? null,
  );
  if (moved) await sleep(700);
  return page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => !t || e.textContent.includes(t));
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    selector,
    text ?? null,
  );
}

async function clickOn(selector, text, { pause = 250 } = {}) {
  const { x, y } = await locate(selector, text);
  await moveTo(x, y);
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

async function typeSlow(selector, text, delay = 45) {
  await page.focus(selector);
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(delay);
  }
}

const answers = () => page.evaluate(() => document.querySelectorAll("[aria-label='Jawaban membantu']").length);

async function ask(question) {
  const before = await answers();
  await clickOn("textarea");
  await typeSlow("textarea", question);
  await sleep(300);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (n) => document.querySelectorAll("[aria-label='Jawaban membantu']").length > n,
    { timeout: 90000 },
    before,
  );
  await sleep(700);
}

async function login(roleLabel) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(400);
  await clickOn("button[aria-pressed]", roleLabel);
  await sleep(350);
  await clickOn("button[type=submit]");
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
  await settle();
}

/** Let data load. The Next dev server can hold a request open, so never wait long for idle. */
async function settle() {
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 4000 }).catch(() => {});
  await sleep(300);
}

async function logout() {
  await page.deleteCookie(...(await page.cookies()));
}

async function slide(html) {
  await page.setContent(
    `<!doctype html><html><head><style>
      html, body { margin: 0; height: 100%; background: ${C.bg}; color: ${C.ink}; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .s { height: 100%; box-sizing: border-box; padding: 64px 80px; display: grid; }
      .lab { font-weight: 600; font-size: 16px; color: ${C.muted}; }
      h1 { font-size: 128px; line-height: .95; font-weight: 750; letter-spacing: -.045em; margin: 0; }
      h2 { font-size: 60px; line-height: 1; font-weight: 720; letter-spacing: -.035em; margin: 0; }
      .mark { width: 72px; height: 72px; border-radius: 18px; background: ${C.brand}; display: grid; place-items: center; }
      .chips { display: flex; gap: 10px; flex-wrap: wrap; }
      .chips span { background: #fff; border: 1.5px solid ${C.line}; border-radius: 999px; padding: 8px 16px; font-weight: 600; font-size: 16px; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
      .card { border-radius: 22px; padding: 24px; background: #fff; border: 1.5px solid ${C.line}; }
      .num { font-size: 56px; font-weight: 760; letter-spacing: -.03em; line-height: 1; color: ${C.strong}; }
      table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 18px; overflow: hidden; font-size: 20px; border: 1.5px solid ${C.line}; }
      th, td { padding: 14px 20px; text-align: right; } th:first-child, td:first-child { text-align: left; }
      th { background: #F1EFEA; color: ${C.muted}; font-size: 15px; font-weight: 600; }
      tr + tr td { border-top: 1px solid ${C.line}; }
      .best td { background: ${C.soft}; font-weight: 700; color: ${C.strong}; }
    </style></head><body>${html}</body></html>`,
    { waitUntil: "load" },
  );
}

const MARK = `<div class="mark"><svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h9M4 10.5h5M4 15h4"/><circle cx="15.5" cy="13.5" r="4"/><path d="m18.5 16.5 2.5 2.5"/></svg></div>`;

/* ---------------------------------------------------------------------- */

const clips = [];

/** Static slides: screenshot → looped clip. Deterministic, unlike screencasting a page that doesn't repaint. */
async function still(name, html, seconds) {
  await slide(html);
  await sleep(300);
  const path = `${OUT}${name}.png`;
  await page.screenshot({ path });
  clips.push({ path, seconds });
  console.log(`✓ ${name}`);
}

async function record(name, fn) {
  const path = `${OUT}${name}.webm`;
  const rec = await page.screencast({ path });
  try {
    await fn();
  } catch (err) {
    await page.screenshot({ path: `${OUT}${name}-FAILED.png` });
    console.error(`✗ ${name} at ${page.url()}`);
    throw err;
  } finally {
    await rec.stop();
  }
  clips.push({ path });
  console.log(`✓ ${name}`);
}

await still(
  "01-title",
  `<div class="s" style="align-content:space-between">
    <div class="lab" style="display:flex;justify-content:space-between"><span>Portfolio · AI engineer (RAG)</span><span>Yodhimas Geffananda</span></div>
    <div style="display:grid;gap:26px">
      ${MARK}
      <h1>Telusur<span style="color:${C.brand}">.</span></h1>
      <p style="font-size:30px;font-weight:600;margin:0;max-width:34ch;line-height:1.25">An internal knowledge assistant that answers from company documents, cites the page, and respects who may read what.</p>
    </div>
    <div class="chips"><span>Hybrid retrieval + reranking</span><span>Row-level security</span><span>Cited streaming answers</span><span>Audit log</span><span>Measured evaluation</span></div>
  </div>`,
  4.2,
);

await record("02-cited-answer", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await caption("Masuk sebagai <b>karyawan</b> (Staff) di workspace PT Nusantara Sejahtera", 1800);
  await login("Karyawan");
  await caption("Bertanya dalam bahasa sehari-hari", 600);
  await ask("Berapa uang harian manager untuk dinas ke Surabaya?");
  await caption("Jawaban streaming — setiap fakta diberi <b>nomor sitasi</b>", 2400);
  await clickOn(".prose-answer button");
  await sleep(1800);
  await caption("Klik sitasi: kutipan dan <b>PDF terbuka di halaman sumbernya</b>", 3400);
  await clickOn("[aria-label='Tutup sumber']");
  await caption("", 200);
});

await record("03-follow-up-and-acl", async () => {
  await ask("kalau untuk staff, berapa plafon hotelnya?");
  await caption("Pertanyaan lanjutan dipahami dari <b>konteks percakapan</b>", 2600);
  await ask("Berapa gaji pokok direktur utama?");
  await caption("Dokumen remunerasi hanya untuk Direksi — Staff <b>tidak pernah melihat isinya</b>", 3600);
  await caption("", 200);
});

await record("04-direksi", async () => {
  await logout();
  await login("Direksi");
  await caption("Pertanyaan yang sama, sekarang sebagai <b>Direksi</b>", 600);
  await ask("Berapa gaji pokok direktur utama?");
  await caption("Terjawab, dengan sumber: hak akses dicek <b>di dalam query pencarian</b>", 3000);
  await ask("Can I use my personal laptop for VPN?");
  await caption("Pertanyaan berbahasa Inggris dijawab dari <b>dokumen berbahasa Indonesia</b>", 3000);
  await caption("", 200);
});

await record("05-knowledge-admin", async () => {
  await logout();
  await login("Knowledge Admin");
  await caption("Admin pengetahuan: kondisi dokumen dan pemakaian dalam satu layar", 2800);
  await clickOn("nav a", "Collections");
  await settle();
  await clickOn("a", "Kebijakan HR");
  await settle();
  await caption("Status ingestion, versi, dan jumlah potongan per dokumen", 2000);
  await clickOn("a", "Struktur Remunerasi Direksi 2026");
  await settle();
  await caption("Dokumen dipotong per section — lengkap dengan halaman untuk sitasi", 2400);
  await clickOn("button", "Direksi");
  await sleep(500);
  await caption("Hak akses per collection atau per dokumen, <b>berlaku seketika</b>", 3000);
  await page.keyboard.press("Escape");
  await caption("", 200);
});

await record("06-access-check-and-gaps", async () => {
  await clickOn("nav a", "Cek akses");
  await settle();
  await clickOn("[role=combobox]");
  await sleep(300);
  await clickOn("[role=option]", "Sari Staff");
  await typeSlow("#q", "Berapa gaji pokok direktur utama?", 25);
  await clickOn("button", "Periksa");
  await page.waitForFunction(() => document.body.innerText.includes("bisa membaca"));
  await caption("Cek akses: lihat apa yang akan didapat seseorang, <b>tanpa memanggil AI</b>", 3400);
  await clickOn("nav a", "Tak terjawab");
  await settle();
  await caption("Pertanyaan yang tidak terjawab dikumpulkan <b>per topik</b> untuk ditindaklanjuti", 2800);
  await caption("", 200);
});

await record("07-evaluation", async () => {
  await clickOn("nav a", "Evaluasi");
  await page.waitForFunction(() => document.body.innerText.includes("Hybrid + rerank"));
  await sleep(500);
  await caption("Kualitas diukur, bukan diklaim: 4 metode pencarian dibandingkan pada 71 pertanyaan uji", 3600);
  await clickOn("tbody tr.cursor-pointer");
  await sleep(500);
  await caption("Setiap kegagalan bisa dibedah: sumber yang diharapkan vs yang ditemukan", 3000);
  await caption("", 200);
});

await record("08-audit", async () => {
  await logout();
  await login("Tenant Admin");
  await clickOn("nav a", "Audit log");
  await page.waitForFunction(() => document.body.innerText.includes("Bertanya"));
  await sleep(400);
  await clickOn("tbody tr", "Bertanya");
  await sleep(400);
  await caption("Audit log <b>append-only</b>: siapa bertanya apa, sumber mana yang dipakai, siapa mengubah akses", 3800);
  await caption("", 200);
});

await still(
  "09-results",
  `<div class="s" style="align-content:center;gap:34px">
    <div style="display:flex;justify-content:space-between;align-items:end">
      <h2>Measured, not claimed.</h2>
      <span class="lab">22 policy documents · 71 test questions · ~30% in English</span>
    </div>
    <table>
      <tr><th>Retrieval</th><th>Recall@1</th><th>MRR</th><th>Correct refusals</th><th>False refusals</th></tr>
      <tr><td>Keyword only</td><td>0.60</td><td>0.71</td><td>—</td><td>—</td></tr>
      <tr><td>Vector only (bge-m3)</td><td>0.84</td><td>0.89</td><td>—</td><td>—</td></tr>
      <tr><td>Hybrid (RRF)</td><td>0.72</td><td>0.83</td><td>—</td><td>—</td></tr>
      <tr class="best"><td>Hybrid + rerank + query translation</td><td>0.97</td><td>0.98</td><td>100%</td><td>2%</td></tr>
    </table>
    <div class="grid">
      <div class="card"><div class="num">0.97</div><div class="lab">Faithfulness (LLM judge)</div></div>
      <div class="card"><div class="num">0.94</div><div class="lab">Answer correctness</div></div>
      <div class="card"><div class="num">0</div><div class="lab">Restricted documents leaked</div></div>
      <div class="card"><div class="num">10→2%</div><div class="lab">False refusals after query translation</div></div>
    </div>
    <div class="chips"><span>FastAPI</span><span>Next.js</span><span>Postgres + pgvector</span><span>bge-m3 + bge-reranker</span><span>Groq (free tier)</span><span>github.com/geffaa/telusur</span></div>
  </div>`,
  7,
);

await browser.close();

/* ---------- join + encode ---------- */
const parts = clips.flatMap((c) => (c.seconds ? ["-loop", "1", "-framerate", "30", "-t", String(c.seconds), "-i", c.path] : ["-i", c.path]));
const filter =
  clips
    .map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xF8F7F4,fps=30,setsar=1[v${i}]`)
    .join(";") +
  ";" +
  clips.map((_, i) => `[v${i}]`).join("") +
  `concat=n=${clips.length}:v=1:a=0[out]`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...parts, "-filter_complex", filter, "-map", "[out]", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}telusur-demo.mp4`]);
console.log(`→ ${OUT}telusur-demo.mp4`);
