import { h, frag } from "../lib/dom.js";
import { fmtOhm, fmtV, codeLink, sub } from "../lib/format.js";
import { worstCase, partsStr, rbCode } from "../lib/solver.js";

class ResistorPanel extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })); }

  render() {
    const { reg, sols, vtol, tol, okPct, sel, filtersOpen } = this;
    this.replaceChildren(
      h("section", { class: "panel" },
        h("div", { class: "ptitle row" },
          h("span", {}, "Solutions ", h("span", { class: "dim" }, `— top ${sols.length}, JLCPCB Basic 1 % resistors, ranked by error`)),
          h("button", { type: "button", class: "filterBtn", onclick: () => this.emit("filters-open-change", { open: true }) }, "⚙ Filters")),
        h("table", {},
          h("thead", {}, h("tr", {},
            h("th", {}, reg.raName), h("th", {}, reg.rbName), h("th", {}, frag("V", sub("OUT"))),
            h("th", {}, "err"), h("th", {}, `worst case (${tol} %)`), h("th", {}, `±${okPct} %?`))),
          h("tbody", {}, ...sols.map((x, i) => {
            const w = worstCase(reg, x.raOhms, x.rb.ohms, tol, vtol);
            const pass = Math.abs(x.err) <= okPct;
            return h("tr", { class: i === sel ? "selrow" : "", onclick: () => this.emit("row-select", { index: i }) },
              h("td", {}, h("span", { class: "rv" }, partsStr(x)),
                x.mode !== "single" ? h("span", { class: "pairtag" }, x.mode === "series" ? "series" : "parallel") : null,
                h("div", { class: "codes" }, ...x.raParts.map((p) => codeLink(rbCode(p))))),
              h("td", {}, h("span", { class: "rv" }, x.rb.label), h("div", { class: "codes" }, codeLink(rbCode(x.rb)))),
              h("td", { class: "num" }, fmtV(x.v)),
              h("td", { class: "num " + (pass ? "ok" : "bad") }, `${x.err >= 0 ? "+" : ""}${x.err.toFixed(2)} %`),
              h("td", { class: "num dim" }, `${fmtV(w[0])} … ${fmtV(w[1])}`),
              h("td", {}, pass ? h("span", { class: "chip pass" }, "fits") : h("span", { class: "chip fail" }, "outside")));
          }))),
        h("div", { class: "dim tnote" }, "LCSC codes are 0603 where stocked as Basic; click a code to open it. Click a row to load it into the formula.")),
      this.filtersDialog());

    if (filtersOpen) {
      const dlg = this.querySelector("#filtersDlg");
      if (dlg && !dlg.open) dlg.showModal();
    }
  }

  filtersDialog() {
    const { reg, tol, okPct, vtolS, pairs } = this;
    return h("dialog",
      {
        id: "filtersDlg", class: "filtersDlg",
        onclick: (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); },
        onclose: () => this.emit("filters-open-change", { open: false }),
      },
      h("div", { class: "secHead" }, "Tolerances — adjustable divider"),
      h("div", { class: "grid2" },
        h("label", { class: "lbl" }, "R tolerance",
          h("select", { onchange: (e) => this.emit("tol-change", { value: parseFloat(e.target.value) }) },
            ...[[0.1, "0.1 %"], [0.5, "0.5 %"], [1, "1 % (Basic)"], [5, "5 %"]].map(([v, t]) =>
              h("option", { value: v, ...(tol === v ? { selected: true } : {}) }, t)))),
        h("label", { class: "lbl" }, frag("V", sub("REF"), " tol %"),
          h("input", { inputmode: "decimal", value: vtolS === null ? reg.vrefTol : vtolS, "data-focus-key": "vtolS", oninput: (e) => this.emit("vtol-change", { value: e.target.value }) })),
        h("label", { class: "lbl" }, "Close enough ±%",
          h("input", { inputmode: "decimal", value: okPct, "data-focus-key": "okPct", oninput: (e) => this.emit("okpct-change", { value: parseFloat(e.target.value) || 0 }) }))),
      h("label", { class: "chk" },
        h("input", { type: "checkbox", ...(pairs ? { checked: true } : {}), onchange: (e) => this.emit("pairs-change", { checked: e.target.checked }) }),
        `Allow two-resistor combos (series / ∥) on ${reg.raName}`),
      h("div", { class: "rbnote dim" },
        `${reg.rbName} (${reg.rbPath}) constrained to ${fmtOhm(reg.rbRange[0])}–${fmtOhm(reg.rbRange[1])} — ${reg.rbHint}.`),
      h("div", { class: "dlgActions" },
        h("button", { type: "button", onclick: () => this.querySelector("#filtersDlg").close() }, "Done")));
  }
}
customElements.define("resistor-panel", ResistorPanel);
