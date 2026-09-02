/* REGULATOR DIVIDER SOLVER — root component. Owns all state; every child
   component below is "props in (via .update()), DOM out, CustomEvents out".
   Data comes from data.json (meta/regulators/fixed/jelly/support/resistors).
   All engineering logic lives in ../lib/solver.js; rendering goes through
   Mustache (../lib/mustache.js). */
import { Mustache } from "../lib/mustache.js";
import { withFocusPreserved } from "../lib/focus.js";
import { codeLink, searchLink, tierChip, fmtV, sub, skuTable, siblingLinks } from "../lib/format.js";
import { buildResistors, solve, worstCase, suggestL, fixedFits, jellyFor, allVariants } from "../lib/solver.js";
import "./requirements-form.js";
import "./part-picker.js";
import "./regulator-detail.js";
import "./fixed-detail.js";
import "./solver-panel.js";
import "./resistor-panel.js";
import "./support-bom.js";

const SHELL_TPL = `
<header>
  <h1 class="hname">{{title}}</h1>
  <div class="hsub">{{subtitle}}</div>
</header>
<div class="cols">
  <aside class="panel controls">
    <requirements-form></requirements-form>
    <part-picker></part-picker>
  </aside>
  <main class="results">{{#sections}}{{{tagHtml}}}{{/sections}}</main>
</div>`;

const BANNER_TPL = `<div class="section banner"><b class="bad">⚠ Over-rated:</b> you asked for {{iout}} A but the {{name}} is a {{amax}} A part ({{limits}}). Pick something bigger — e.g. <button type="button" class="siblink" data-action="pick-bigger" data-id="tps5430">TPS5430</button> {{{c9864}}} (Basic, 3 A) or <button type="button" class="siblink" data-action="pick-bigger" data-id="tps54560">TPS54560B</button> {{{c1850354}}} (Extended, 5 A).</div>`;
const EMPTY_TPL = `<div class="section empty">{{msg}}{{{actionHtml}}}</div>`;
const IC_ROW_TPL = `{{name}} <span class="dim">· {{pkgNote}}</span>`;
const SUPPORT_ROW_TPL = `{{d}}{{#note}} <span class="dim">· {{note}}</span>{{/note}}`;
const L_ROW_TPL = `≈ {{pick}} µH, I{{{subSat}}} > {{ipk}} A <span class="dim">· from V{{{subIn}}} {{vin}} V, {{fsw}} kHz{{fswNote}}, 30 % ripple</span>`;
const NOTES_TPL = `<ul class="notes">{{#notes}}<li>{{.}}</li>{{/notes}}</ul>`;
const BOOST_WARN_TPL = `<div class="warn">Boost topology needs V{{{subIn}}} below V{{{subOut}}} — currently it isn't.</div>`;

class RegulatorSolver extends HTMLElement {
  constructor() {
    super();
    this.state = {
      selectedId: "lm317",
      vtS: "5", vinS: "12", ioutS: "1",
      tol: 1, okPct: 2, pairs: true, vtolS: null,
      sel: 0, showAll: false, filtersOpen: false,
      /* Open by default only where the sidebar sits beside the results
         column (matches .cols' own 820px breakpoint) -- below that, the
         part list would otherwise push the schematic/formula/solutions
         well below the fold before a narrow-viewport user ever sees them. */
      pickerOpen: window.matchMedia("(min-width: 821px)").matches,
    };
    this.data = null;
  }

  async connectedCallback() {
    const url = this.getAttribute("data-src") || "data.json";
    try {
      this.data = await (await fetch(url)).json();
    } catch (e) {
      this.innerHTML = `<div class="panel empty">Could not load data.json — serve this over http, not file://.</div>`;
      return;
    }
    this.RESISTORS = buildResistors(this.data.resistors);
    Object.assign(this.state, this.readHash());
    history.replaceState(null, "", this.buildHash(this.state));
    window.addEventListener("popstate", () => this.restoreFromHash());
    this.wireEvents();
    this.render();
  }

  /* URL state -- the whole point is that the address bar always reflects
     what's on screen closely enough to copy-paste and get the same page
     back: which part, which resistor solution, and the requirement/filter
     values that produced it. Every state change keeps the hash in sync via
     history.replaceState (no back-stack growth -- typing shouldn't fight
     the Back button). Only an explicit "link" click -- picking a part/
     sibling, or a specific resistor-solution row -- gets a real
     history.pushState entry, via navigate() instead of set(). */
  static #DEFAULTS = { selectedId: "lm317", sel: 0, vtS: "5", vinS: "12", ioutS: "1", tol: 1, okPct: 2, pairs: true, vtolS: null };

  buildHash(state) {
    const p = new URLSearchParams();
    p.set("id", state.selectedId);
    p.set("sel", String(state.sel));
    p.set("vt", state.vtS);
    p.set("vin", state.vinS);
    p.set("iout", state.ioutS);
    p.set("tol", String(state.tol));
    p.set("ok", String(state.okPct));
    p.set("pairs", state.pairs ? "1" : "0");
    if (state.vtolS !== null) p.set("vtol", state.vtolS);
    return "#" + p.toString();
  }

  readHash() {
    const D = RegulatorSolver.#DEFAULTS;
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    const num = (key, fallback) => p.has(key) ? (parseFloat(p.get(key)) || fallback) : fallback;
    return {
      selectedId: p.get("id") || D.selectedId,
      sel: p.has("sel") ? (parseInt(p.get("sel"), 10) || 0) : D.sel,
      vtS: p.get("vt") ?? D.vtS,
      vinS: p.get("vin") ?? D.vinS,
      ioutS: p.get("iout") ?? D.ioutS,
      tol: num("tol", D.tol),
      okPct: num("ok", D.okPct),
      pairs: p.has("pairs") ? p.get("pairs") === "1" : D.pairs,
      vtolS: p.has("vtol") ? p.get("vtol") : D.vtolS,
    };
  }

  restoreFromHash() {
    Object.assign(this.state, this.readHash());
    this.render();
  }

  /* Keeps the URL live-synced without touching the back-stack. */
  set(patch) {
    Object.assign(this.state, patch);
    const hash = this.buildHash(this.state);
    if (hash !== location.hash) history.replaceState(null, "", hash);
    this.render();
  }

  /* Same as set(), but for "click a link" actions -- pushes a real,
     back-navigable history entry instead of replacing in place. */
  navigate(patch) {
    Object.assign(this.state, patch);
    const hash = this.buildHash(this.state);
    if (hash !== location.hash) history.pushState(null, "", hash);
    this.render();
  }

  wireEvents() {
    /* Delegated handler for the recovery-message action links: the
       over-rated banner's "pick something bigger" suggestions, and the
       empty states' "try {value}"/"try wider tolerance" one-click fixes.
       Each dispatches the same event its own dedicated control already
       triggers (part-select, requirements-change, okpct-change) rather than
       mutating state directly, so there's one source of truth per field.
       Action names are deliberately distinct from every child component's
       own vocabulary (select, select-row, select-sibling, tol, vtol, okpct,
       pairs, open/close-filters, toggle-showall) -- those clicks bubble up
       to this same root listener, and colliding names would double-fire. */
    this.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "pick-bigger") {
        this.dispatchEvent(new CustomEvent("part-select", { detail: { id: btn.dataset.id }, bubbles: true, composed: true }));
      } else if (action === "set-target") {
        this.dispatchEvent(new CustomEvent("requirements-change", { detail: { key: "vtS", value: btn.dataset.value }, bubbles: true, composed: true }));
      } else if (action === "try-wider-tolerance") {
        this.dispatchEvent(new CustomEvent("okpct-change", { detail: { value: parseFloat(btn.dataset.value) }, bubbles: true, composed: true }));
      }
    });
    this.addEventListener("requirements-change", (e) => {
      const { key, value } = e.detail;
      const patch = { [key]: value };
      if (key === "vtS") patch.sel = 0;
      this.set(patch);
    });
    this.addEventListener("part-select", (e) => {
      this.navigate({ selectedId: e.detail.id, sel: 0, vtolS: null });
    });
    this.addEventListener("toggle-showall", () => this.set({ showAll: !this.state.showAll }));
    this.addEventListener("row-select", (e) => this.navigate({ sel: e.detail.index }));
    this.addEventListener("tol-change", (e) => this.set({ tol: e.detail.value }));
    this.addEventListener("vtol-change", (e) => this.set({ vtolS: e.detail.value }));
    this.addEventListener("okpct-change", (e) => this.set({ okPct: e.detail.value }));
    this.addEventListener("pairs-change", (e) => this.set({ pairs: e.detail.checked, sel: 0 }));
    this.addEventListener("filters-open-change", (e) => this.set({ filtersOpen: e.detail.open }));
    this.addEventListener("picker-open-change", (e) => this.set({ pickerOpen: e.detail.open }));
  }

  /* derived snapshot for the current state */
  derive() {
    const S = this.state, D = this.data;
    const vt = Math.abs(parseFloat(S.vtS)) || 0;
    const vin = parseFloat(S.vinS) || 0;
    const iout = parseFloat(S.ioutS) || 0.5;

    const variant = allVariants(D.families).find((v) => v.id === S.selectedId);

    if (variant.kind === "fixed") {
      const f = fixedFits(variant, vin, iout);
      return { kind: "fixed", f, vt, vin, iout };
    }

    const reg = variant;
    const vtol = S.vtolS === null ? reg.referenceVoltageTolerancePct : parseFloat(S.vtolS) || 0;
    // needsReview variants (auto-discovered, unverified referenceVoltage)
    // never produce solutions -- the empty state below explains why.
    const canSolve = reg.referenceVoltage != null && reg.bottomResistorRange;
    const sols = canSolve && vt > reg.vOutMin ? solve(this.RESISTORS, reg, vt, S.pairs) : [];
    const s = sols[Math.min(S.sel, Math.max(sols.length - 1, 0))];
    const wc = s ? worstCase(reg, s.raOhms, s.rb.ohms, S.tol, vtol) : null;
    const L = canSolve ? suggestL(reg, vt, vin, iout) : null;
    const amaxM = /([\d.]+)\s*A/.exec(reg.limits || "");
    const amax = amaxM ? parseFloat(amaxM[1]) : null;
    const overI = amax != null && iout > amax;
    return { kind: "reg", reg, vt, vin, iout, vtol, sols, s, wc, L, amax, overI, canSolve };
  }

  render() {
    withFocusPreserved(this, () => {
      const S = this.state, D = this.data, R = this.derive();
      const sections = this.mainSections(R, S, D);

      this.innerHTML = Mustache.render(SHELL_TPL, { title: D.meta.title, subtitle: D.meta.subtitle, sections });

      this.querySelector("requirements-form").update({ vtS: S.vtS, vinS: S.vinS, ioutS: S.ioutS });
      this.querySelector("part-picker").update({
        families: D.families, vt: R.vt, vin: R.vin, iout: R.iout,
        showAll: S.showAll, selectedId: S.selectedId, pickerOpen: S.pickerOpen,
      });
      for (const sec of sections) {
        if (sec.tag) this.querySelector(sec.tag)?.update(sec.props);
      }
    });
  }

  /* builds the main-column sections for the current derive() snapshot. Each
     section is either a custom-element tag (needs .update() after attach)
     or a fully-rendered static HTML snippet (banner/empty state). */
  mainSections(R, S, D) {
    const sections = [];

    if (R.kind === "fixed") {
      sections.push({ tag: "fixed-detail", tagHtml: "<fixed-detail></fixed-detail>", props: { f: R.f, vt: R.vt } });
      sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: { ...this.fixedBomRows(R, D), title: "Around this part " } });
      return sections;
    }

    const { reg, vt, vin, iout, vtol, sols, s, wc, L, amax, overI, canSolve } = R;
    sections.push({ tag: "regulator-detail", tagHtml: "<regulator-detail></regulator-detail>", props: {
      reg, vtolDisplay: S.vtolS === null ? reg.referenceVoltageTolerancePct : S.vtolS,
    } });

    if (overI) {
      sections.push({ tagHtml: Mustache.render(BANNER_TPL, {
        iout, name: reg.name, amax, limits: reg.limits, c9864: codeLink("C9864"), c1850354: codeLink("C1850354"),
      }) });
    }

    if (!canSolve) {
      sections.push({ tagHtml: Mustache.render(EMPTY_TPL, {
        msg: "This variant's reference voltage / divider fields aren't verified yet — see the ⚠ notice above. Nothing to solve until that's confirmed.",
      }) });
      sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: this.regBomRows(R, D) });
    } else if (vt <= reg.vOutMin) {
      /* Smallest step strictly above the floor, not a "nice" rail voltage --
         this is a nudge past the wall, not an engineering recommendation. */
      const suggested = Math.ceil(reg.vOutMin * 10 + 1) / 10;
      sections.push({ tagHtml: Mustache.render(EMPTY_TPL, {
        msg: `This part can't regulate below its ${fmtV(reg.referenceVoltage)} reference${reg.isShunt ? "" : " (plus headroom)"}. Enter a target above ${fmtV(reg.vOutMin)} — `,
        actionHtml: `<button type="button" class="siblink" data-action="set-target" data-value="${suggested}">try ${fmtV(suggested, 2)}</button>.`,
      }) });
      sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: this.regBomRows(R, D) });
    } else if (!s) {
      const canWiden = S.okPct < 5;
      sections.push({ tagHtml: Mustache.render(EMPTY_TPL, {
        msg: `No solutions within ±${S.okPct} % — check the target${canWiden ? ", or " : " or widen the close-enough band."}`,
        actionHtml: canWiden ? `<button type="button" class="siblink" data-action="try-wider-tolerance" data-value="5">try ±5 %</button>.` : "",
      }) });
      sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: this.regBomRows(R, D) });
    } else {
      /* hero (schematic + formula) leads, then the ranked solutions table,
         then the BOM -- matches the reference layout: readout up top,
         options right under it, sourcing/passives last. */
      sections.push({ tag: "solver-panel", tagHtml: "<solver-panel></solver-panel>", props: { reg, s, wc, vt, vtol, tol: S.tol, okPct: S.okPct } });
      sections.push({ tag: "resistor-panel", tagHtml: "<resistor-panel></resistor-panel>", props: {
        reg, sols, vtol, tol: S.tol, okPct: S.okPct, sel: S.sel, pairs: S.pairs, vtolS: S.vtolS, filtersOpen: S.filtersOpen,
      } });
      sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: this.regBomRows(R, D) });
    }

    return sections;
  }

  regBomRows(R, D) {
    const { reg, vin, L } = R;
    const rows = [
      { role: "IC", primaryHtml: Mustache.render(IC_ROW_TPL, { name: reg.name, pkgNote: reg.packageNote }),
        codeHtml: (reg.bestLcsc ? codeLink(reg.bestLcsc) : searchLink(reg.name.split(" ")[0], "search JLC")) + " " + tierChip(reg.bestTier) },
      ...(reg.supportComponents || []).map((p) => ({
        role: p.role,
        primaryHtml: Mustache.render(SUPPORT_ROW_TPL, { d: p.description, note: p.note }),
        codeHtml: p.c ? codeLink(p.c) : `<span class="dim">pick/search</span>`,
      })),
    ];
    if (L) {
      rows.push({
        role: "L",
        primaryHtml: Mustache.render(L_ROW_TPL, {
          pick: L.pick, ipk: L.ipk.toFixed(1), subSat: sub("sat"), subIn: sub("IN"),
          vin, fsw: (reg.switchingFreqHz / 1e3).toFixed(0), fswNote: reg.switchingFreqNote ? ` (${reg.switchingFreqNote})` : "",
        }),
        codeHtml: searchLink(`${L.pick}uH power inductor`, "search JLC") + ` <span class="tier ext">Extended</span>`,
      });
    }
    if (reg.hasCatchDiode && !(reg.supportComponents || []).some((p) => p.role.startsWith("D"))) {
      rows.push({ role: "D", primaryHtml: "Schottky catch diode", codeHtml: codeLink(D.support.ss34.c) });
    }

    const extra = [];
    if (reg.notes && reg.notes.length) extra.push(Mustache.render(NOTES_TPL, { notes: reg.notes }));
    if (reg.isBoost && R.vin >= R.vt && R.vt > 0) extra.push(Mustache.render(BOOST_WARN_TPL, { subIn: sub("IN"), subOut: sub("OUT") }));

    return {
      rows, extra,
      skuTableHtml: skuTable(reg.skus),
      siblingsHtml: siblingLinks(D.families[reg.familyId].variants, reg.id),
    };
  }

  fixedBomRows(R, D) {
    const { f } = R;
    const rows = [
      { role: "IC", primaryHtml: Mustache.render(IC_ROW_TPL, { name: f.name, pkgNote: f.description }), codeHtml: codeLink(f.bestLcsc) + " " + tierChip(f.bestTier) },
      ...jellyFor(D.jelly, f.name).map(([role, p, note]) => ({
        role,
        primaryHtml: Mustache.render(SUPPORT_ROW_TPL, { d: typeof p === "string" ? p : p.d, note }),
        codeHtml: typeof p === "string" ? searchLink(p.split(" ≥")[0] + " inductor", "search JLC") : codeLink(p.c),
      })),
    ];
    return {
      rows,
      skuTableHtml: skuTable(f.skus),
      siblingsHtml: siblingLinks(D.families[f.familyId].variants, f.id),
    };
  }
}
customElements.define("regulator-solver", RegulatorSolver);
