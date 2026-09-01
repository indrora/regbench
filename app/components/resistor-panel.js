import { Mustache } from "../lib/mustache.js";
import { withFocusPreserved } from "../lib/focus.js";
import { fmtOhm, fmtV, codeLink, sub } from "../lib/format.js";
import { worstCase, partsStr, rbCode } from "../lib/solver.js";

const TEMPLATE = `
<section class="panel">
  <div class="ptitle row">
    <span>Solutions <span class="dim">— top {{solCount}}, JLCPCB Basic 1 % resistors, ranked by error</span></span>
    <button type="button" class="filterBtn" data-action="open-filters">⚙ Filters</button>
  </div>
  <table>
    <thead><tr>
      <th>{{raName}}</th><th>{{rbName}}</th><th>{{{voutHeaderHtml}}}</th>
      <th>err</th><th>worst case ({{tol}} %)</th><th>±{{okPct}} %?</th>
    </tr></thead>
    <tbody>
    {{#rows}}
      <tr class="{{cls}}" data-action="select-row" data-index="{{index}}">
        <td>
          <span class="rv">{{raLabel}}</span>
          {{#isPair}}<span class="pairtag">{{pairLabel}}</span>{{/isPair}}
          <div class="codes">{{{raCodesHtml}}}</div>
        </td>
        <td><span class="rv">{{rbLabel}}</span><div class="codes">{{{rbCodeHtml}}}</div></td>
        <td class="num">{{voutStr}}</td>
        <td class="num {{errCls}}">{{errStr}}</td>
        <td class="num dim">{{wcStr}}</td>
        <td>{{{passChipHtml}}}</td>
      </tr>
    {{/rows}}
    </tbody>
  </table>
  <div class="dim tnote">LCSC codes are 0603 where stocked as Basic; click a code to open it. Click a row to load it into the formula.</div>
</section>
<dialog id="filtersDlg" class="filtersDlg">
  <div class="secHead">Tolerances — adjustable divider</div>
  <div class="grid2">
    <label class="lbl">R tolerance
      <select data-action="tol">
        {{#tolOptions}}<option value="{{value}}"{{#selected}} selected{{/selected}}>{{label}}</option>{{/tolOptions}}
      </select>
    </label>
    <label class="lbl">{{{vrefTolLabelHtml}}}
      <input inputmode="decimal" data-focus-key="vtolS" data-action="vtol" value="{{vtolValue}}">
    </label>
    <label class="lbl">Close enough ±%
      <input inputmode="decimal" data-focus-key="okPct" data-action="okpct" value="{{okPct}}">
    </label>
  </div>
  <label class="chk">
    <input type="checkbox" data-action="pairs"{{#pairsChecked}} checked{{/pairsChecked}}>
    Allow two-resistor combos (series / ∥) on {{raName}}
  </label>
  <div class="rbnote dim">{{rbNote}}</div>
  <div class="dlgActions"><button type="button" data-action="close-filters">Done</button></div>
</dialog>`;

class ResistorPanel extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", (e) => {
      if (e.target.id === "filtersDlg") { e.target.close(); return; }
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      if (action === "select-row") this.emit("row-select", { index: Number(el.dataset.index) });
      else if (action === "open-filters") this.emit("filters-open-change", { open: true });
      else if (action === "close-filters") this.querySelector("#filtersDlg")?.close();
    });
    this.addEventListener("change", (e) => {
      if (e.target.dataset.action === "tol") this.emit("tol-change", { value: parseFloat(e.target.value) });
      else if (e.target.dataset.action === "pairs") this.emit("pairs-change", { checked: e.target.checked });
    });
    this.addEventListener("input", (e) => {
      if (e.target.dataset.action === "vtol") this.emit("vtol-change", { value: e.target.value });
      else if (e.target.dataset.action === "okpct") this.emit("okpct-change", { value: parseFloat(e.target.value) || 0 });
    });
  }

  update(props) { Object.assign(this, props); this.render(); }
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })); }

  render() {
    withFocusPreserved(this, () => {
      this.innerHTML = Mustache.render(TEMPLATE, this.viewModel());
      const dlg = this.querySelector("#filtersDlg");
      if (dlg) {
        dlg.addEventListener("close", () => this.emit("filters-open-change", { open: false }));
        if (this.filtersOpen && !dlg.open) dlg.showModal();
      }
    });
  }

  viewModel() {
    const { reg, sols, vtol, tol, okPct, sel, pairs, vtolS } = this;
    const rows = sols.map((x, i) => {
      const w = worstCase(reg, x.raOhms, x.rb.ohms, tol, vtol);
      const pass = Math.abs(x.err) <= okPct;
      return {
        cls: i === sel ? "selrow" : "", index: i,
        raLabel: partsStr(x), isPair: x.mode !== "single", pairLabel: x.mode === "series" ? "series" : "parallel",
        raCodesHtml: x.raParts.map((p) => codeLink(rbCode(p))).join(""),
        rbLabel: x.rb.label, rbCodeHtml: codeLink(rbCode(x.rb)),
        voutStr: fmtV(x.v), errCls: pass ? "ok" : "bad", errStr: `${x.err >= 0 ? "+" : ""}${x.err.toFixed(2)} %`,
        wcStr: `${fmtV(w[0])} … ${fmtV(w[1])}`,
        passChipHtml: pass ? `<span class="chip pass">fits</span>` : `<span class="chip fail">outside</span>`,
      };
    });

    return {
      raName: reg.topResistorName, rbName: reg.bottomResistorName, tol, okPct, solCount: sols.length, rows,
      voutHeaderHtml: `V${sub("OUT")}`, vrefTolLabelHtml: `V${sub("REF")} tol %`,
      tolOptions: [[0.1, "0.1 %"], [0.5, "0.5 %"], [1, "1 % (Basic)"], [5, "5 %"]]
        .map(([v, label]) => ({ value: v, label, selected: tol === v })),
      vtolValue: vtolS === null ? reg.referenceVoltageTolerancePct : vtolS,
      pairsChecked: pairs,
      rbNote: `${reg.bottomResistorName} (${reg.bottomResistorPath}) constrained to ${fmtOhm(reg.bottomResistorRange[0])}–${fmtOhm(reg.bottomResistorRange[1])} — ${reg.bottomResistorHint}.`,
    };
  }
}
customElements.define("resistor-panel", ResistorPanel);
