// Builds deck/KRIYA-pitch.pptx — the TOKEN2049 Origins pitch deck as a native PowerPoint file.
// Coordinates are authored on a 1920×1080 px canvas (same as the web deck) and converted:
// 144 px = 1 inch on LAYOUT_WIDE, and 2 px = 1 pt for type.
const path = require("node:path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL_SCRIPTS
  ? path.join(process.env.PPTX_SKILL_SCRIPTS, "apply_theme.js")
  : "./apply_theme.js");

const THEME = {
  name: "KRIYA",
  headFontFace: "Arial",
  bodyFontFace: "Arial",
  colors: {
    dk1: "0B0F14", lt1: "FFFFFF", dk2: "101820", lt2: "F3F5F2",
    accent1: "7CF7C4", accent2: "5AA8FF", accent3: "C38BFF",
    accent4: "FFB547", accent5: "0B7A5C", accent6: "FF5D6C",
    hlink: "5AA8FF", folHlink: "C38BFF",
  },
};
// Neutrals that have no theme slot (hex by necessity)
const N = {
  dark: "0B0F14", light: "F3F5F2", inkDark: "EEF2F6", mutedDark: "9AA8BA", dimDark: "6B7A8F",
  panel: "141A22", line: "263040", mutedLight: "4A5568", row: "E7ECE6", cardLine: "D9DED8",
  card: "FFFFFF", reserve: "3A4658", dash: "07090D", dashPanel: "0E1218", dashLine: "1F2733",
};
const MONO = "Courier New";

const px = (v) => v / 144;
const pt = (v) => v / 2;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "KRIYA — Autonomous Capital Protocol";
pres.author = "Saurabh";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ------------------------------------------------------------------ layouts
const titlePh = (color) => ({
  placeholder: {
    options: {
      name: "title", type: "title",
      x: px(128), y: px(176), w: px(1664), h: px(180),
      fontSize: pt(72), bold: true, color, valign: "top", align: "left", margin: 0,
    },
    text: "Title",
  },
});
pres.defineSlideMaster({ title: "KRIYA Dark", background: { color: N.dark }, objects: [titlePh(N.inkDark)] });
pres.defineSlideMaster({ title: "KRIYA Light", background: { color: N.light }, objects: [titlePh(C.text2)] });
pres.defineSlideMaster({ title: "KRIYA Dark Blank", background: { color: N.dark }, objects: [] });
pres.defineSlideMaster({ title: "KRIYA Light Blank", background: { color: N.light }, objects: [] });

// ------------------------------------------------------------------ helpers
function text(slide, value, o) {
  slide.addText(value, {
    isTextBox: true, margin: o.inset !== undefined ? pt(o.inset) : 0, valign: o.valign ?? "top",
    x: px(o.x), y: px(o.y), w: px(o.w), h: px(o.h),
    fontSize: pt(o.size ?? 32), color: o.color, bold: o.bold, italic: o.italic,
    fontFace: o.font, align: o.align ?? "left", charSpacing: o.spacing,
    lineSpacingMultiple: o.lh, objectName: o.name,
    fill: o.fill ? { color: o.fill } : undefined,
    line: o.lineColor ? { color: o.lineColor, width: 0.75 } : undefined,
    shape: o.radius ? pres.ShapeType.roundRect : undefined,
    rectRadius: o.radius ? px(o.radius) : undefined,
  });
}
function box(slide, o) {
  slide.addShape(o.round === false ? pres.ShapeType.rect : pres.ShapeType.roundRect, {
    x: px(o.x), y: px(o.y), w: px(o.w), h: px(o.h),
    fill: { color: o.fill }, line: o.line ? { color: o.line, width: o.lineW ?? 0.75 } : { type: "none" },
    rectRadius: o.round === false ? undefined : px(o.r ?? 16), objectName: o.name,
  });
}
const eyebrow = (slide, value, color, y = 128, x = 128, w = 1664) =>
  text(slide, value.toUpperCase(), { x, y, w, h: 36, size: 24, font: MONO, color, spacing: 1.5, name: "Eyebrow" });

function bar(slide, x, y, w, h, segs) {
  let cx = x;
  segs.forEach(([share, color], i) => {
    const sw = (w * share) / 100;
    slide.addShape(pres.ShapeType.rect, { x: px(cx), y: px(y), w: px(sw), h: px(h), fill: { color }, line: { type: "none" }, objectName: `Bar ${i + 1}` });
    cx += sw;
  });
}
const tx = (hash) => `https://sepolia.etherscan.io/tx/${hash}`;

// ------------------------------------------------------------------ 1 cover
pres.addSection({ title: "Why capital needs programmable objectives" });
{
  const s = pres.addSlide({ masterName: "KRIYA Dark Blank", sectionTitle: "Why capital needs programmable objectives" });
  s.addShape(pres.ShapeType.ellipse, { x: px(1150), y: px(-420), w: px(1250), h: px(1000), fill: { color: "13324A", transparency: 35 }, line: { type: "none" }, objectName: "Glow" });
  eyebrow(s, "TOKEN2049 Origins · Chainlink CRE", C.accent1, 300);
  text(s, "KRIYA", { x: 128, y: 350, w: 1664, h: 230, size: 200, bold: true, color: N.inkDark, spacing: 24, name: "Wordmark" });
  text(s, [
    { text: "Autonomous Capital Protocol. Stop programming transactions. ", options: { color: "C9D3DF" } },
    { text: "Start programming financial objectives.", options: { color: THEME.colors.accent1 } },
  ], { x: 128, y: 610, w: 1450, h: 150, size: 44, lh: 1.15, name: "Tagline" });
  text(s, "kriya-beta.vercel.app · github.com/Saurabhnage/kriya · Live on Ethereum Sepolia", { x: 128, y: 952, w: 1664, h: 40, size: 24, font: MONO, color: N.mutedDark, name: "Footer" });
  s.addNotes("Today we program money transaction by transaction. KRIYA lets us program money around objectives. I'm going to show you capital that understands a goal, stays inside hard limits, and rebalances itself — live on Sepolia.");
}

// ------------------------------------------------------------------ 2 problem
{
  const s = pres.addSlide({ masterName: "KRIYA Light", sectionTitle: "Why capital needs programmable objectives" });
  eyebrow(s, "The problem", C.accent5);
  s.addText("Onchain capital still makes you decide every transaction yourself", { placeholder: "title" });
  const steps = ["Find", "Compare", "Assess risk", "Execute", "Monitor", "Rebalance", "Exit"];
  const w = (1664 - 6 * 16) / 7;
  steps.forEach((label, i) => {
    const x = 128 + i * (w + 16);
    box(s, { x, y: 420, w, h: 150, fill: N.card, line: N.cardLine, name: `Step ${i + 1}` });
    text(s, `0${i + 1}`, { x: x + 24, y: 444, w: w - 48, h: 32, size: 24, font: MONO, color: C.accent5, name: `Step ${i + 1} number` });
    text(s, label, { x: x + 24, y: 496, w: w - 48, h: 52, size: 28, color: C.text2, bold: true, name: `Step ${i + 1} label` });
  });
  text(s, [
    { text: "Automation today runs " }, { text: "predefined actions", options: { bold: true, color: THEME.colors.dk2 } },
    { text: ". AI can reason, contracts can enforce, oracles can verify — but nothing combines them into one bounded loop around a " },
    { text: "financial objective", options: { bold: true, color: THEME.colors.dk2 } }, { text: "." },
  ], { x: 128, y: 640, w: 1500, h: 180, size: 32, color: N.mutedLight, lh: 1.3, name: "Gap" });
  s.addNotes("Every DeFi user is their own portfolio manager: find, compare, assess, execute, monitor, rebalance, exit — by hand. Bots automate fixed actions, not outcomes. The missing layer is combining AI reasoning, verifiable data and contract enforcement into one bounded loop.");
}

// ------------------------------------------------------------------ 3 thesis
{
  const s = pres.addSlide({ masterName: "KRIYA Light Blank", sectionTitle: "Why capital needs programmable objectives" });
  s.background = { color: THEME.colors.accent1 };
  eyebrow(s, "The primitive", "0B3B2C", 200);
  text(s, "Programmable Financial Objectives", { x: 128, y: 250, w: 1664, h: 300, size: 120, bold: true, color: C.text1, lh: 0.95, name: "Primitive" });
  const steps = ["Objective + constraints", "Decision", "Verification", "Enforcement", "Continuous optimization"];
  const w = 290, gap = (1664 - 5 * w) / 4;
  steps.forEach((label, i) => {
    const x = 128 + i * (w + gap);
    text(s, label, {
      x, y: 610, w, h: 120, size: 30, bold: true, align: "center", valign: "middle",
      color: i === 0 ? THEME.colors.accent1 : THEME.colors.dk1,
      fill: i === 0 ? THEME.colors.dk1 : undefined, lineColor: i === 0 ? undefined : THEME.colors.dk1,
      radius: 20, inset: 16, name: `Flow ${i + 1}`,
    });
    if (i < 4) s.addShape(pres.ShapeType.rightArrow, { x: px(x + w + gap / 2 - 18), y: px(655), w: px(36), h: px(30), fill: { color: THEME.colors.dk1 }, line: { type: "none" }, objectName: `Flow arrow ${i + 1}` });
  });
  text(s, "Not “if X, execute Y”. The human defines the mandate; KRIYA runs the decision loop; contracts enforce the boundaries.", { x: 128, y: 800, w: 1500, h: 110, size: 36, color: "0B3B2C", lh: 1.2, name: "Statement" });
  s.addNotes("This is the core idea. Instead of programming the transaction, you program the outcome and the limits. KRIYA handles the loop; smart contracts make sure the loop can never step outside your limits.");
}

// ------------------------------------------------------------------ 4 mandate
pres.addSection({ title: "How KRIYA turns a mandate into bounded autonomous execution" });
const S2 = "How KRIYA turns a mandate into bounded autonomous execution";
{
  const s = pres.addSlide({ masterName: "KRIYA Dark Blank", sectionTitle: S2 });
  eyebrow(s, "The product", C.accent1, 230, 128, 800);
  text(s, "A capital mandate, not a transaction", { x: 128, y: 280, w: 780, h: 180, size: 72, bold: true, color: N.inkDark, lh: 1.05, name: "Title" });
  text(s, [
    { text: "One wallet flow: mint test USDC, approve, " }, { text: "KriyaVault.openMandate", options: { color: N.inkDark, fontFace: MONO } },
    { text: ". Capital and its objective are programmed in a single transaction, and the limits live onchain." },
  ], { x: 128, y: 500, w: 780, h: 280, size: 32, color: N.mutedDark, lh: 1.35, name: "Flow" });
  box(s, { x: 1008, y: 170, w: 784, h: 740, fill: N.panel, line: N.line, r: 24, name: "Mandate card" });
  text(s, "KriyaMandate · demo", { x: 1064, y: 226, w: 672, h: 36, size: 24, font: MONO, color: N.mutedDark });
  text(s, "$1,000 USDC", { x: 1064, y: 276, w: 672, h: 90, size: 72, bold: true, color: N.inkDark });
  text(s, "Maximize risk-adjusted yield", { x: 1064, y: 380, w: 672, h: 48, size: 32, color: C.accent1 });
  const rows = [["Max risk (strategy & portfolio)", "40"], ["Max strategy exposure", "40%"], ["Min USDC reserve", "25%"], ["Max drawdown", "5%"], ["Autonomous rebalance", "ON"]];
  s.addTable(rows.map(([k, v]) => [
    { text: k, options: { color: N.mutedDark } }, { text: v, options: { color: N.inkDark, align: "right", bold: true } },
  ]), { x: px(1064), y: px(470), w: px(672), colW: [px(552), px(120)], fontFace: MONO, fontSize: pt(28), rowH: px(76), border: { type: "solid", color: N.line, pt: 0.75 }, margin: [0, px(8), 0, px(8)], valign: "middle", objectName: "Limits" });
  s.addNotes("The user creates a mandate: capital, objective, risk limit, exposure cap, liquidity reserve, drawdown floor, allowed strategies, and whether KRIYA may rebalance on its own. That mandate becomes the control layer for the capital.");
}

// ------------------------------------------------------------------ 5 architecture
{
  const s = pres.addSlide({ masterName: "KRIYA Light", sectionTitle: S2 });
  eyebrow(s, "Architecture", C.accent5);
  s.addText("Five layers, each with one job", { placeholder: "title" });
  const rows = [
    ["Intent", "What the user wants", "KriyaMandate: objective + hard limits"],
    ["Intelligence", "How KRIYA decides", "Claude decision engine → typed allocation"],
    ["Verification", "What reality says", "Chainlink CRE: HTTP consensus + EVM reads"],
    ["Enforcement", "What is permitted", "KriyaExecutor.validateAllocation, reverts"],
    ["Execution", "What happens onchain", "KriyaVault ⇄ allowlisted strategy vaults"],
  ];
  const head = ["Layer", "Responsibility", "In KRIYA"].map((t) => ({ text: t, options: { bold: true, color: N.inkDark, fill: { color: THEME.colors.dk2 } } }));
  s.addTable([head, ...rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: j === 0, color: THEME.colors.dk2, fill: { color: i % 2 ? N.row : N.light } } })))],
    { x: px(128), y: px(330), w: px(1664), colW: [px(330), px(530), px(804)], fontSize: pt(30), rowH: px(84), valign: "middle", margin: [0, px(20), 0, px(20)], border: { type: "solid", color: N.cardLine, pt: 0.75 }, objectName: "Layers" });
  s.addNotes("The separation of responsibilities is the design. Intent lives in the mandate contract. Intelligence proposes. Chainlink CRE checks external and onchain reality. The executor contract enforces. The vault moves capital, and only between itself and allowlisted strategies.");
}

// ------------------------------------------------------------------ 6 loop
{
  const s = pres.addSlide({ masterName: "KRIYA Dark", sectionTitle: S2 });
  eyebrow(s, "The decision loop · Chainlink CRE workflow", C.accent1);
  s.addText("One cron-triggered workflow closes the loop, every run", { placeholder: "title" });
  const steps = [
    ["OBSERVE", "Risk feed via HTTP, DON consensus"], ["VERIFY", "Changed risk → signed report onchain"],
    ["DETECT", "Mandate health under verified risk"], ["DECIDE", "Claude returns a typed allocation"],
    ["CONSTRAIN", "Policy re-checked inside the workflow"], ["EXECUTE", "Report → KriyaExecutor.onReport"],
  ];
  const gap = 44, w = (1664 - 5 * gap) / 6;
  steps.forEach(([k, v], i) => {
    const x = 128 + i * (w + gap), last = i === 5;
    box(s, { x, y: 420, w, h: 250, fill: N.panel, line: last ? THEME.colors.accent2 : N.line, name: `${k} card` });
    text(s, k, { x: x + 22, y: 446, w: w - 44, h: 36, size: 24, font: MONO, bold: true, color: last ? C.accent2 : C.accent1 });
    text(s, v, { x: x + 22, y: 500, w: w - 44, h: 150, size: 24, color: N.mutedDark, lh: 1.25 });
    if (i < 5) s.addShape(pres.ShapeType.rightArrow, { x: px(x + w + 8), y: px(530), w: px(28), h: px(28), fill: { color: THEME.colors.accent2 }, line: { type: "none" }, objectName: `Arrow ${i + 1}` });
  });
  text(s, [
    { text: "One rulebook (" }, { text: "policy.ts", options: { color: N.inkDark, fontFace: MONO } },
    { text: ") is shared by the agent and the CRE workflow, compiled to WASM, and mirrored in Solidity. A server keeper runs the identical loop as a fallback path." },
  ], { x: 128, y: 720, w: 1600, h: 130, size: 30, color: N.mutedDark, lh: 1.3, name: "Rulebook" });
  text(s, "cre/kriya-workflow/main.ts · TypeScript → WASM · reports routed through the Keystone forwarder", { x: 128, y: 952, w: 1664, h: 40, size: 24, font: MONO, color: N.dimDark, name: "Footer" });
  s.addNotes("This is the Chainlink CRE workflow. It observes the external risk feed with DON consensus, writes verified risk changes onchain, detects mandates at risk, asks Claude for a proposal, re-validates it with the same rules, and writes a signed rebalance report to the executor contract.");
}

// ------------------------------------------------------------------ 7 security
{
  const s = pres.addSlide({ masterName: "KRIYA Light Blank", sectionTitle: S2 });
  eyebrow(s, "Security boundary", C.accent5, 250, 128, 760);
  text(s, [
    { text: "AI proposes.", options: { breakLine: true } }, { text: "Rules constrain.", options: { breakLine: true } },
    { text: "CRE verifies.", options: { breakLine: true } }, { text: "Contracts enforce.", options: { color: THEME.colors.accent5 } },
  ], { x: 128, y: 300, w: 760, h: 380, size: 72, bold: true, color: C.text2, lh: 1.05, name: "Boundary" });
  text(s, [
    { text: "The agent never holds user funds. Its key can only call " }, { text: "executeAllocation", options: { bold: true, color: THEME.colors.dk2 } },
    { text: ", which runs the same onchain checks as CRE reports. Funds move only vault ⇄ allowlisted strategies." },
  ], { x: 984, y: 200, w: 808, h: 230, size: 32, color: C.text2, lh: 1.3, name: "Custody" });
  text(s, "An allocation outside the mandate reverts with a typed error:", { x: 984, y: 460, w: 808, h: 40, size: 26, color: N.mutedLight });
  const errs = ["ExposureExceeded", "StrategyRiskExceeded", "PortfolioRiskExceeded", "ReserveBelowMinimum", "StrategyNotAllowed", "DrawdownExceeded"];
  errs.forEach((e, i) => {
    const x = 984 + (i % 2) * 412, y = 524 + Math.floor(i / 2) * 76;
    text(s, e, { x, y, w: 396, h: 56, size: 24, font: MONO, color: C.text2, fill: N.card, lineColor: N.cardLine, radius: 10, valign: "middle", inset: 14, name: `Error ${i + 1}` });
  });
  text(s, "Human override: pause mandate · emergency exit · withdraw.", { x: 984, y: 790, w: 808, h: 40, size: 26, color: N.mutedLight, name: "Override" });
  s.addNotes("The AI must never directly control unrestricted funds. Even if the decision engine proposes something reckless, the executor contract reverts it. The user can pause the agent, pull everything back to the reserve, or withdraw at any time.");
}

// ------------------------------------------------------------------ 8 demo
pres.addSection({ title: "The working loop, live on Ethereum Sepolia" });
const S3 = "The working loop, live on Ethereum Sepolia";
{
  const s = pres.addSlide({ masterName: "KRIYA Dark", sectionTitle: S3 });
  eyebrow(s, "The demo · reality changes", C.accent1);
  s.addText("Strategy B gets riskier. KRIYA rebalances itself.", { placeholder: "title" });
  const w = (1664 - 96) / 3, y = 420, h = 520;
  const col = (i) => 128 + i * (w + 48);
  const B = THEME.colors.accent2, A = THEME.colors.accent1, Cc = THEME.colors.accent3;
  // 1
  box(s, { x: col(0), y, w, h, fill: N.panel, line: N.line, r: 20, name: "Initial card" });
  text(s, "1 · Initial allocation", { x: col(0) + 40, y: y + 40, w: w - 80, h: 36, size: 24, font: MONO, color: N.mutedDark });
  bar(s, col(0) + 40, y + 110, w - 80, 40, [[40, B], [35, A], [25, N.reserve]]);
  text(s, "B 40% · A 35% · Reserve 25%", { x: col(0) + 40, y: y + 180, w: w - 80, h: 44, size: 30, color: N.inkDark });
  text(s, [{ text: "Risk 21" }, { text: " / 40", options: { color: N.dimDark } }], { x: col(0) + 40, y: y + 260, w: w - 80, h: 80, size: 56, bold: true, color: N.inkDark });
  text(s, "✓ Mandate safe", { x: col(0) + 40, y: y + 380, w: w - 80, h: 40, size: 26, color: C.accent1 });
  // 2
  box(s, { x: col(1), y, w, h, fill: "1E1A12", line: THEME.colors.accent4, r: 20, name: "Reality card" });
  text(s, "2 · Reality changes", { x: col(1) + 40, y: y + 40, w: w - 80, h: 36, size: 24, font: MONO, color: C.accent4 });
  text(s, "B risk 34 → 48", { x: col(1) + 40, y: y + 100, w: w - 80, h: 80, size: 56, bold: true, color: N.inkDark });
  text(s, "Chainlink CRE verifies the score and writes it onchain. B now breaks the max risk of 40.", { x: col(1) + 40, y: y + 200, w: w - 80, h: 170, size: 30, color: N.inkDark, lh: 1.3 });
  text(s, "⚠ Mandate at risk", { x: col(1) + 40, y: y + 380, w: w - 80, h: 40, size: 26, color: C.accent4 });
  // 3
  box(s, { x: col(2), y, w, h, fill: N.panel, line: THEME.colors.accent1, r: 20, name: "Rebalanced card" });
  text(s, "3 · Autonomous rebalance", { x: col(2) + 40, y: y + 40, w: w - 80, h: 36, size: 24, font: MONO, color: N.mutedDark });
  bar(s, col(2) + 40, y + 110, w - 80, 40, [[40, A], [35, Cc], [25, N.reserve]]);
  text(s, "A 40% · C 35% · Reserve 25%", { x: col(2) + 40, y: y + 180, w: w - 80, h: 44, size: 30, color: N.inkDark });
  text(s, [{ text: "Risk 14" }, { text: " / 40", options: { color: N.dimDark } }], { x: col(2) + 40, y: y + 260, w: w - 80, h: 80, size: 56, bold: true, color: N.inkDark });
  text(s, "✓ Mandate restored · 0 violations", { x: col(2) + 40, y: y + 380, w: w - 80, h: 40, size: 26, color: C.accent1 });
  s.addNotes("Here is the live scenario. Initial allocation: B 40, A 35, reserve 25 — risk 21 of 40. Then we change reality: Strategy B's risk jumps from 34 to 48. The verified score breaks the mandate. KRIYA detects it, Claude decides, the workflow validates, and the contract rebalances: A 40, C 35, reserve 25 — risk 14, mandate restored. The user never chose a transaction.");
}

// ------------------------------------------------------------------ 9 dashboard
{
  const s = pres.addSlide({ masterName: "KRIYA Dark Blank", sectionTitle: S3 });
  s.background = { color: N.dash };
  text(s, "KRIYA", { x: 128, y: 96, w: 600, h: 70, size: 56, bold: true, color: N.inkDark, spacing: 12 });
  text(s, "Sepolia · live dashboard", { x: 1412, y: 106, w: 380, h: 50, size: 24, font: MONO, color: "8592A6", lineColor: N.dashLine, radius: 25, align: "center", valign: "middle" });
  const stats = [["Capital", "$1,000.00"], ["Expected yield", "7.42%"], ["Risk", "21 / 40"], ["Mandate", "✓ SAFE"]];
  const sw = (1664 - 72) / 4;
  stats.forEach(([k, v], i) => {
    const x = 128 + i * (sw + 24);
    box(s, { x, y: 210, w: sw, h: 150, fill: N.dashPanel, line: i === 3 ? "2F6B57" : N.dashLine, name: `${k} stat` });
    text(s, k, { x: x + 28, y: 236, w: sw - 56, h: 34, size: 24, color: "8592A6" });
    text(s, v, { x: x + 28, y: 280, w: sw - 56, h: 60, size: 44, font: i === 3 ? undefined : MONO, bold: i === 3, color: i === 3 ? THEME.colors.accent1 : N.inkDark });
  });
  const lw = 960;
  box(s, { x: 128, y: 390, w: lw, h: 520, fill: N.dashPanel, line: N.dashLine, name: "Allocation panel" });
  text(s, "Allocation", { x: 160, y: 418, w: 400, h: 34, size: 24, color: "8592A6" });
  bar(s, 160, 470, lw - 64, 24, [[40, THEME.colors.accent2], [35, THEME.colors.accent1], [25, N.reserve]]);
  const rows = [["Strategy", "APY", "Risk", "Weight"], ["B · LP Yield", "11.2%", "34", "40%"], ["A · Stable Lending", "8.4%", "21", "35%"], ["C · T-Bill Vault", "6.8%", "15", "0%"], ["USDC Reserve", "—", "2", "25%"]];
  s.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { color: i === 0 ? "8592A6" : N.inkDark, align: j === 0 ? "left" : "right" } }))),
    { x: px(160), y: px(530), w: px(lw - 64), colW: [px(436), px(160), px(140), px(160)], fontFace: MONO, fontSize: pt(24), rowH: px(66), valign: "middle", border: { type: "solid", color: N.dashLine, pt: 0.75 }, margin: [0, px(10), 0, px(10)], objectName: "Allocation table" });
  const ax = 128 + lw + 24, aw = 1664 - lw - 24;
  box(s, { x: ax, y: 390, w: aw, h: 520, fill: N.dashPanel, line: N.dashLine, name: "Activity panel" });
  text(s, "KRIYA activity", { x: ax + 32, y: 418, w: aw - 64, h: 34, size: 24, color: "8592A6" });
  const acts = [["⚡", THEME.colors.accent1, "CRE rebalance · Claude decision"], ["⚠", THEME.colors.accent4, "Verified risk: B 34 → 48"], ["✗", THEME.colors.accent6, "Unsafe 60% proposal reverted"], ["◆", THEME.colors.accent1, "Mandate active · KRIYA authorized"]];
  acts.forEach(([icon, color, label], i) => text(s, [{ text: `${icon}  `, options: { color } }, { text: label }], { x: ax + 32, y: 480 + i * 90, w: aw - 64, h: 70, size: 24, color: N.inkDark, lh: 1.2 }));
  text(s, "Rebuilt from the live Sepolia state at kriya-beta.vercel.app · every activity row links to its transaction", { x: 128, y: 952, w: 1664, h: 40, size: 24, font: MONO, color: N.dimDark, name: "Footer" });
  s.addNotes("This is the dashboard judges can open themselves. Capital, expected yield, risk against the mandate limit, mandate status, the allocation, and an activity log that interleaves onchain events with the agent's decisions, each linked to Etherscan.");
}

// ------------------------------------------------------------------ 10 proof
{
  const s = pres.addSlide({ masterName: "KRIYA Light", sectionTitle: S3 });
  eyebrow(s, "Proof · Ethereum Sepolia", C.accent5);
  s.addText("Real transactions, real reverts, real CRE reports", { placeholder: "title" });
  const rows = [
    ["Open $1,000 mandate", "0x7b0fd91db394dd1156e0c37d1383eb5752e39e444f4458a822a6e9e4601b554f"],
    ["Unsafe 60% proposal · reverted (ExposureExceeded)", "0x6eee86fd1dd39e1c9f939d4e04c92bc1d477eecec828c89553fcfe4eba3077b9"],
    ["CRE VERIFY · risk report, B 34 → 48", "0x66deb846f9d9a4d33b2a5a6ff6635a5c1b9692064479274e7eac8cd1498136b9"],
    ["CRE EXECUTE · Claude’s rebalance A 40 · C 35 · R 25", "0x2d8a4366bf67a6f5e7a9f7ce6b3aff2556921ba8c22e0c7af91b914a983441d5"],
    ["CRE VERIFY · risk restored, B 48 → 34", "0xd4fc8b94dba0810391055ffa6fee49c8034c50d26f54b8c66234ba2fe46db59f"],
  ];
  const head = ["Step", "Transaction"].map((t) => ({ text: t, options: { bold: true, color: N.inkDark, fill: { color: THEME.colors.dk2 } } }));
  s.addTable([head, ...rows.map(([step, h], i) => {
    const fill = { color: i % 2 ? N.row : N.light };
    return [
      { text: step, options: { color: THEME.colors.dk2, fill, bold: step.startsWith("CRE") } },
      { text: `${h.slice(0, 10)}…${h.slice(-4)}`, options: { fontFace: MONO, color: THEME.colors.accent5, fill, hyperlink: { url: tx(h), tooltip: "View on Sepolia Etherscan" } } },
    ];
  })], { x: px(128), y: px(330), w: px(1664), colW: [px(1100), px(564)], fontSize: pt(28), rowH: px(80), valign: "middle", margin: [0, px(18), 0, px(18)], border: { type: "solid", color: N.cardLine, pt: 0.75 }, objectName: "Transactions" });
  text(s, "CRE reports delivered via the Keystone forwarder to KriyaExecutor 0x9c5f…656A · logged onchain as source = CRE", { x: 128, y: 952, w: 1664, h: 40, size: 24, color: N.mutedLight, name: "Footer" });
  s.addNotes("Everything here is onchain. The mandate; the unsafe proposal that reverted; then the Chainlink CRE workflow: it verified Strategy B's risk jump, Claude proposed the rebalance, the workflow re-checked it, and the signed report executed through the forwarder. The executor logs that execution with source CRE. Click any hash.");
}

// ------------------------------------------------------------------ 11 stack
{
  const s = pres.addSlide({ masterName: "KRIYA Dark", sectionTitle: S3 });
  eyebrow(s, "What we built", C.accent1);
  s.addText("One vertical slice, end to end", { placeholder: "title" });
  const cards = [
    ["01", THEME.colors.accent1, "Contracts", "Vault, Mandate, Executor, Registry. 23 Foundry tests, incl. 1,000-run fuzz."],
    ["02", THEME.colors.accent2, "Chainlink CRE", "TypeScript workflow → WASM. HTTP consensus, EVM reads, signed reports."],
    ["03", THEME.colors.accent3, "Decision engine", "Claude Sonnet 5.5, schema-bound output, validated three times."],
    ["04", THEME.colors.accent4, "Live app", "Next.js on Vercel. 12 unit + 15 end-to-end tests, all in CI."],
  ];
  const w = (1664 - 96) / 4;
  cards.forEach(([n, color, title, body], i) => {
    const x = 128 + i * (w + 32);
    box(s, { x, y: 330, w, h: 500, fill: N.panel, line: N.line, r: 20, name: `${title} card` });
    s.addShape(pres.ShapeType.ellipse, { x: px(x + 40), y: px(370), w: px(84), h: px(84), fill: { color }, line: { type: "none" }, objectName: `${title} badge` });
    text(s, n, { x: x + 40, y: 370, w: 84, h: 84, size: 30, bold: true, font: MONO, color: THEME.colors.dk1, align: "center", valign: "middle" });
    text(s, title, { x: x + 40, y: 490, w: w - 80, h: 56, size: 36, bold: true, color: N.inkDark });
    text(s, body, { x: x + 40, y: 566, w: w - 80, h: 220, size: 26, color: N.mutedDark, lh: 1.3 });
  });
  s.addNotes("We built one polished vertical slice rather than five disconnected integrations: contracts with 23 tests including fuzzing, the Chainlink CRE workflow, a Claude decision engine whose output is always validated, and a live app on Vercel against Sepolia.");
}

// ------------------------------------------------------------------ 12 different
pres.addSection({ title: "Why it matters and where it goes" });
const S4 = "Why it matters and where it goes";
{
  const s = pres.addSlide({ masterName: "KRIYA Light", sectionTitle: S4 });
  eyebrow(s, "Why it’s different", C.accent5);
  s.addText("Not another AI trading bot", { placeholder: "title" });
  const rows = [
    ["Executes predefined strategies", "Optimizes toward an objective"], ["User specifies transactions", "User specifies a mandate"],
    ["Static automation", "Adaptive decision loop"], ["AI may hold broad authority", "AI bounded by onchain constraints"],
    ["Manual strategy changes", "Verified, autonomous reallocation"],
  ];
  const head = [{ text: "Typical DeFi bot", options: { bold: true, color: N.mutedDark, fill: { color: THEME.colors.dk2 } } }, { text: "KRIYA", options: { bold: true, color: THEME.colors.accent1, fill: { color: THEME.colors.dk2 } } }];
  s.addTable([head, ...rows.map(([a, b], i) => {
    const fill = { color: i % 2 ? N.row : N.light };
    return [{ text: a, options: { color: N.mutedLight, fill } }, { text: b, options: { color: THEME.colors.dk2, bold: true, fill } }];
  })], { x: px(128), y: px(330), w: px(1664), colW: [px(832), px(832)], fontSize: pt(32), rowH: px(86), valign: "middle", margin: [0, px(20), 0, px(20)], border: { type: "solid", color: N.cardLine, pt: 0.75 }, objectName: "Comparison" });
  s.addNotes("KRIYA is not a bot, a dashboard or a chatbot. The primitive is the programmable objective: the user states the outcome, and the protocol keeps capital pointed at it inside hard limits.");
}

// ------------------------------------------------------------------ 13 vision
{
  const s = pres.addSlide({ masterName: "KRIYA Dark", sectionTitle: S4 });
  eyebrow(s, "Where it goes", C.accent1);
  s.addText("From an autonomous vault to an autonomous capital network", { placeholder: "title" });
  const tiles = ["DAO treasury mandates", "Protocol-owned liquidity", "Strategy reputation", "Paid research via x402", "Cross-chain capital routing", "Agent-to-agent capital markets"];
  const w = (1664 - 48) / 3;
  tiles.forEach((t, i) => {
    const x = 128 + (i % 3) * (w + 24), y = 430 + Math.floor(i / 3) * 170;
    text(s, t, { x, y, w, h: 140, size: 30, color: N.inkDark, fill: N.panel, lineColor: N.line, radius: 16, valign: "middle", inset: 28, name: `Vision ${i + 1}` });
  });
  s.addNotes("The same primitive scales up: treasuries, protocol-owned liquidity, agents paying for research with x402, routing across chains, and eventually capital allocated between autonomous agents. As agents act independently, capital management is the missing capability.");
}

// ------------------------------------------------------------------ 14 team
{
  const s = pres.addSlide({ masterName: "KRIYA Light Blank", sectionTitle: S4 });
  box(s, { x: 128, y: 200, w: 620, h: 680, fill: THEME.colors.dk2, r: 24, name: "Builder card" });
  s.addShape(pres.ShapeType.ellipse, { x: px(192), y: px(264), w: px(144), h: px(144), fill: { color: THEME.colors.accent1 }, line: { type: "none" }, objectName: "Avatar" });
  text(s, "SN", { x: 192, y: 264, w: 144, h: 144, size: 56, bold: true, color: THEME.colors.dk1, align: "center", valign: "middle" });
  text(s, "Saurabh", { x: 192, y: 450, w: 500, h: 80, size: 64, bold: true, color: N.inkDark });
  text(s, "Solo builder", { x: 192, y: 550, w: 500, h: 48, size: 32, color: C.accent1 });
  text(s, "github.com/Saurabhnage", { x: 192, y: 630, w: 520, h: 40, size: 26, font: MONO, color: N.mutedDark, name: "GitHub" });
  eyebrow(s, "Team", C.accent5, 220, 844, 948);
  text(s, "One builder, every layer", { x: 844, y: 270, w: 948, h: 90, size: 72, bold: true, color: C.text2, name: "Title" });
  const rows = [["Smart contracts", "4 contracts · 23 tests incl. fuzzing"], ["Chainlink CRE", "TypeScript workflow compiled to WASM"], ["Decision engine", "Claude, checked by one shared policy"], ["Product", "Live app · 15 end-to-end checks in CI"]];
  s.addTable(rows.map(([a, b], i) => {
    const fill = { color: i % 2 ? N.row : N.light };
    return [{ text: a, options: { bold: true, color: THEME.colors.dk2, fill } }, { text: b, options: { color: N.mutedLight, fill } }];
  }), { x: px(844), y: px(420), w: px(948), colW: [px(330), px(618)], fontSize: pt(28), rowH: px(100), valign: "middle", margin: [0, px(18), 0, px(18)], border: { type: "solid", color: N.cardLine, pt: 0.75 }, objectName: "Built" });
  s.addNotes("KRIYA is a solo build. I designed and built every layer: the contracts and their tests, the Chainlink CRE workflow, the Claude decision engine with its shared policy, and the live app on Sepolia.");
}

// ------------------------------------------------------------------ 15 close
{
  const s = pres.addSlide({ masterName: "KRIYA Dark Blank", sectionTitle: S4 });
  text(s, [
    { text: "The user didn’t tell KRIYA what transaction to make. " },
    { text: "They told it what outcome they wanted.", options: { color: THEME.colors.accent1 } },
  ], { x: 128, y: 250, w: 1600, h: 400, size: 80, bold: true, color: N.inkDark, lh: 1.1, name: "Closing line" });
  text(s, [{ text: "App  ", options: { color: N.mutedDark } }, { text: "kriya-beta.vercel.app", options: { hyperlink: { url: "https://kriya-beta.vercel.app" }, color: THEME.colors.accent2 } }], { x: 128, y: 720, w: 760, h: 50, size: 30, font: MONO, name: "App link" });
  text(s, [{ text: "Code  ", options: { color: N.mutedDark } }, { text: "github.com/Saurabhnage/kriya", options: { hyperlink: { url: "https://github.com/Saurabhnage/kriya" }, color: THEME.colors.accent2 } }], { x: 900, y: 720, w: 892, h: 50, size: 30, font: MONO, name: "Code link" });
  text(s, "KRIYA · capital that understands an objective, stays inside its limits, and optimizes itself.", { x: 128, y: 952, w: 1664, h: 40, size: 24, font: MONO, color: N.mutedDark, name: "Footer" });
  s.addNotes("The user didn't tell KRIYA what transaction to make. They told KRIYA what outcome they wanted. KRIYA turns capital from something humans operate into something humans can program. Thank you.");
}

(async () => {
  const out = path.join(__dirname, "KRIYA-pitch.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("Wrote", out);
})();
