/* REGULATOR DIVIDER SOLVER — root component. Owns all state; every child
   component below is "props in (via .update()), DOM out, CustomEvents out".
   Data comes from data.json (meta/regulators/fixed/jelly/support/resistors).
   All engineering logic lives in ../lib/solver.js. */
import { h, frag, withFocusPreserved } from "../lib/dom.js";
import { codeLink, searchLink, tierChip, fmtV, sub } from "../lib/format.js";
import { buildResistors, solve, worstCase, suggestL, fixedFit, jellyFor } from "../lib/solver.js";
import "./requirements-form.js";
import "./part-picker.js";
import "./regulator-detail.js";
import "./fixed-detail.js";
import "./solver-panel.js";
import "./resistor-panel.js";
import "./support-bom.js";

class RegulatorSolver extends HTMLElement {
  constructor() {
    super();
    this.state = {
      kind: "reg", regId: "lm317", fixedSel: null,
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
      this.append(h("div", { class: "panel empty" }, "Could not load data.json — serve this over http, not file://."));
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
      const { kind, id } = e.detail;
      this.set(kind === "reg" ? { kind: "reg", regId: id, sel: 0, vtolS: null } : { kind: "fixed", fixedSel: id });
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

    if (S.kind === "fixed") {
      const f = fixedFit(D.fixed.find((x) => x.n === S.fixedSel), vin, iout);
      return { kind: "fixed", f, vt, vin, iout };
    }

    const reg = D.regulators.find((r) => r.id === S.regId);
    const vtol = S.vtolS === null ? reg.vrefTol : parseFloat(S.vtolS) || 0;
    const sols = vt > reg.minV ? solve(this.RESISTORS, reg, vt, S.pairs) : [];
    const s = sols[Math.min(S.sel, Math.max(sols.length - 1, 0))];
    const wc = s ? worstCase(reg, s.raOhms, s.rb.ohms, S.tol, vtol) : null;
    const L = suggestL(reg, vt, vin, iout);
    const amaxM = /([\d.]+)\s*A/.exec(reg.limits || "");
    const amax = amaxM ? parseFloat(amaxM[1]) : null;
    const overI = amax != null && iout > amax;
    return { kind: "reg", reg, vt, vin, iout, vtol, sols, s, wc, L, amax, overI };
  }

  render() {
    withFocusPreserved(this, () => {
      const S = this.state, D = this.data, R = this.derive();

      const reqForm = document.createElement("requirements-form");
      const picker = document.createElement("part-picker");
      const { nodes, updates } = this.buildBody(R, S, D);

      this.replaceChildren(
        h("header", {},
          h("div", { class: "hname" }, D.meta.title),
          h("div", { class: "hsub" }, D.meta.subtitle)),
        h("div", { class: "cols" },
          h("aside", { class: "panel controls" }, reqForm, picker),
          h("main", { class: "results" }, ...nodes)));

      reqForm.update({ vtS: S.vtS, vinS: S.vinS, ioutS: S.ioutS });
      picker.update({
        regulators: D.regulators, fixed: D.fixed, vt: R.vt, vin: R.vin, iout: R.iout,
        showAll: S.showAll, kind: S.kind, regId: S.regId, fixedSel: S.fixedSel,
      });
      for (const [el, props] of updates) el.update(props);
    });
  }

  /* builds the main-column children for the current derive() snapshot, plus
     the .update() props each custom-element child needs once attached */
  buildBody(R, S, D) {
    const updates = [];
    const mk = (tag, props) => { const el = document.createElement(tag); updates.push([el, props]); return el; };
    const nodes = [];

    if (R.kind === "fixed") {
      nodes.push(mk("fixed-detail", { f: R.f, vt: R.vt }));
      nodes.push(mk("support-bom", { ...this.fixedBomRows(R, D), title: "Around this part " }));
      return { nodes, updates };
    }

    const { reg, vt, vin, iout, vtol, sols, s, wc, L, amax, overI } = R;
    nodes.push(mk("regulator-detail", { reg, vtolDisplay: S.vtolS === null ? reg.vrefTol : S.vtolS }));

    if (overI) {
      nodes.push(h("div", { class: "banner", style: "border-color:var(--red,#c0392b)" },
        h("b", {}, "⚠ Over-rated:"),
        ` you asked for ${iout} A but the ${reg.name} is a ${amax} A part (${reg.limits}). Pick something bigger — e.g. TPS5430 `,
        codeLink("C9864"), " (Basic, 3 A) or TPS54560B ", codeLink("C1850354"), " (Extended, 5 A)."));
    }

    if (vt <= reg.minV) {
      nodes.push(h("div", { class: "panel empty" },
        `This part can't regulate below its ${fmtV(reg.vref)} reference${reg.shunt ? "" : " (plus headroom)"}. Enter a target above ${fmtV(reg.minV)}.`));
    } else if (!s) {
      nodes.push(h("div", { class: "panel empty" }, "No solutions in range — widen the close-enough band or check the target."));
    } else {
      nodes.push(mk("solver-panel", { reg, s, wc, vt, vtol, tol: S.tol, okPct: S.okPct }));
      nodes.push(mk("resistor-panel", {
        reg, sols, vtol, tol: S.tol, okPct: S.okPct, sel: S.sel, pairs: S.pairs,
        vtolS: S.vtolS, filtersOpen: S.filtersOpen,
      }));
    }

    nodes.push(mk("support-bom", this.regBomRows(R, D)));
    return { nodes, updates };
  }

  regBomRows(R, D) {
    const { reg, vin, L } = R;
    const rows = [
      { role: "IC", primary: h("span", {}, reg.name, " ", h("span", { class: "dim" }, "· " + reg.pkgNote)),
        code: h("span", {}, reg.lcsc ? codeLink(reg.lcsc) : searchLink(reg.name.split(" ")[0], "search JLC"), " ", tierChip(reg.tier)) },
      ...reg.support.map((p) => ({
        role: p.role,
        primary: h("span", {}, p.d, p.note ? h("span", { class: "dim" }, " · " + p.note) : null),
        code: p.c ? codeLink(p.c) : h("span", { class: "dim" }, "pick/search"),
      })),
    ];
    if (L) {
      rows.push({
        role: "L",
        primary: h("span", {}, `≈ ${L.pick} µH, I`, sub("sat"), ` > ${L.ipk.toFixed(1)} A `,
          h("span", { class: "dim" }, frag("· from V", sub("IN"), ` ${vin} V, ${(reg.fsw / 1e3).toFixed(0)} kHz${reg.fswNote ? ` (${reg.fswNote})` : ""}, 30 % ripple`))),
        code: h("span", {}, searchLink(`${L.pick}uH power inductor`, "search JLC"), " ", h("span", { class: "tier ext" }, "Extended")),
      });
    }
    if (reg.diode && !reg.support.some((p) => p.role.startsWith("D"))) {
      rows.push({ role: "D", primary: h("span", {}, "Schottky catch diode"), code: codeLink(D.support.ss34.c) });
    }

    const extra = [
      reg.variants ? h("div", { class: "dim", style: "margin:4px 0" }, "Variants: ",
        ...reg.variants.map((v, i) => h("span", {}, i > 0 ? " · " : "", v.n + " ", v.c ? codeLink(v.c) : searchLink(v.n.split(" ")[0]), v.note ? ` (${v.note})` : ""))) : null,
      (reg.notes && reg.notes.length) ? h("ul", { class: "notes" }, ...reg.notes.map((n) => h("li", {}, n))) : null,
      (reg.boost && R.vin >= R.vt && R.vt > 0) ? h("div", { class: "warn" }, frag("Boost topology needs V", sub("IN"), " below V", sub("OUT"), " — currently it isn't.")) : null,
    ].filter(Boolean);

    return { rows, extra };
  }

  fixedBomRows(R, D) {
    const { f } = R;
    const rows = [
      { role: "IC", primary: h("span", {}, f.n, " ", h("span", { class: "dim" }, "· " + f.d)), code: h("span", {}, codeLink(f.c), " ", tierChip(f.tier)) },
      ...jellyFor(D.jelly, f.n).map(([role, p, note]) => ({
        role,
        primary: h("span", {}, typeof p === "string" ? p : p.d, note ? h("span", { class: "dim" }, " · " + note) : null),
        code: typeof p === "string" ? searchLink(p.split(" ≥")[0] + " inductor", "search JLC") : codeLink(p.c),
      })),
    ];
    return { rows };
  }
}
customElements.define("regulator-solver", RegulatorSolver);
