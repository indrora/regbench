/* REGULATOR DIVIDER SOLVER — root component. Owns all state; every child
   component below is "props in (via .update()), DOM out, CustomEvents out".
   Data comes from data.json (meta/regulators/fixed/jelly/support/resistors).
   All engineering logic lives in ../lib/solver.js; rendering goes through
   Mustache (../lib/mustache.js). */
import { Mustache } from "../lib/mustache.js";
import { withFocusPreserved } from "../lib/focus.js";
import { codeLink, searchLink, tierChip, fmtV, sub } from "../lib/format.js";
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
  <div class="hname">{{title}}</div>
  <div class="hsub">{{subtitle}}</div>
</header>
<div class="cols">
  <aside class="panel controls">
    <requirements-form></requirements-form>
    <part-picker></part-picker>
  </aside>
  <main class="results">{{#sections}}{{{tagHtml}}}{{/sections}}</main>
</div>`;

const BANNER_TPL = `<div class="banner" style="border-color:var(--red,#c0392b)"><b>⚠ Over-rated:</b> you asked for {{iout}} A but the {{name}} is a {{amax}} A part ({{limits}}). Pick something bigger — e.g. TPS5430 {{{c9864}}} (Basic, 3 A) or TPS54560B {{{c1850354}}} (Extended, 5 A).</div>`;
const EMPTY_TPL = `<div class="panel empty">{{msg}}</div>`;
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
    this.wireEvents();
    this.render();
  }

  wireEvents() {
    this.addEventListener("requirements-change", (e) => {
      const { key, value } = e.detail;
      const patch = { [key]: value };
      if (key === "vtS") patch.sel = 0;
      this.set(patch);
    });
    this.addEventListener("part-select", (e) => {
      this.set({ selectedId: e.detail.id, sel: 0, vtolS: null });
    });
    this.addEventListener("toggle-showall", () => this.set({ showAll: !this.state.showAll }));
    this.addEventListener("row-select", (e) => this.set({ sel: e.detail.index }));
    this.addEventListener("tol-change", (e) => this.set({ tol: e.detail.value }));
    this.addEventListener("vtol-change", (e) => this.set({ vtolS: e.detail.value }));
    this.addEventListener("okpct-change", (e) => this.set({ okPct: e.detail.value }));
    this.addEventListener("pairs-change", (e) => this.set({ pairs: e.detail.checked, sel: 0 }));
    this.addEventListener("filters-open-change", (e) => this.set({ filtersOpen: e.detail.open }));
  }

  set(patch) { Object.assign(this.state, patch); this.render(); }

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
        showAll: S.showAll, selectedId: S.selectedId,
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
      sections.push({ tag: "fixed-detail", tagHtml: "<fixed-detail></fixed-detail>", props: { f: R.f, vt: R.vt, siblings: D.families[R.f.familyId].variants } });
      sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: { ...this.fixedBomRows(R, D), title: "Around this part " } });
      return sections;
    }

    const { reg, vt, vin, iout, vtol, sols, s, wc, L, amax, overI, canSolve } = R;
    sections.push({ tag: "regulator-detail", tagHtml: "<regulator-detail></regulator-detail>", props: {
      reg, vtolDisplay: S.vtolS === null ? reg.referenceVoltageTolerancePct : S.vtolS, siblings: D.families[reg.familyId].variants,
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
    } else if (vt <= reg.vOutMin) {
      sections.push({ tagHtml: Mustache.render(EMPTY_TPL, {
        msg: `This part can't regulate below its ${fmtV(reg.referenceVoltage)} reference${reg.isShunt ? "" : " (plus headroom)"}. Enter a target above ${fmtV(reg.vOutMin)}.`,
      }) });
    } else if (!s) {
      sections.push({ tagHtml: Mustache.render(EMPTY_TPL, { msg: "No solutions in range — widen the close-enough band or check the target." }) });
    } else {
      sections.push({ tag: "solver-panel", tagHtml: "<solver-panel></solver-panel>", props: { reg, s, wc, vt, vtol, tol: S.tol, okPct: S.okPct } });
      sections.push({ tag: "resistor-panel", tagHtml: "<resistor-panel></resistor-panel>", props: {
        reg, sols, vtol, tol: S.tol, okPct: S.okPct, sel: S.sel, pairs: S.pairs, vtolS: S.vtolS, filtersOpen: S.filtersOpen,
      } });
    }

    sections.push({ tag: "support-bom", tagHtml: "<support-bom></support-bom>", props: this.regBomRows(R, D) });
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

    return { rows, extra };
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
    return { rows };
  }
}
customElements.define("regulator-solver", RegulatorSolver);
