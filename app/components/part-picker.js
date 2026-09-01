import { h } from "../lib/dom.js";
import { codeLink, searchLink, tierChip } from "../lib/format.js";
import { regFits, topoTag, fixedFit, railMatch } from "../lib/solver.js";

class PartPicker extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  select(kind, id) {
    this.dispatchEvent(new CustomEvent("part-select", { detail: { kind, id }, bubbles: true, composed: true }));
  }

  render() {
    const { regulators, fixed, vt, vin, iout, showAll, kind, regId, fixedSel } = this;

    const adjFits = regulators.filter((r) => regFits(r, vt, vin, iout));
    const adjOut = regulators.filter((r) => !regFits(r, vt, vin, iout));
    const fixedMatches = fixed.filter((f) => railMatch(f, vt)).map((f) => fixedFit(f, vin, iout))
      .sort((a, b) => (b.ok - a.ok) || (b.i - a.i) || ((a.tier === "Basic" ? 0 : 1) - (b.tier === "Basic" ? 0 : 1)));
    const fixFits = fixedMatches.filter((f) => f.ok);
    const fixOut = fixedMatches.filter((f) => !f.ok);

    const pickRow = (r) => h("button",
      { class: "regpick" + (kind === "reg" && regId === r.id ? " on" : "") + (adjOut.includes(r) ? " out" : ""), onclick: () => this.select("reg", r.id) },
      h("span", { class: "rp-name" }, r.name),
      h("span", { class: "rp-meta" }, h("span", { class: "rp-vendor" }, r.mfr), h("span", { class: "rp-type" }, topoTag(r))),
      h("span", { class: "rp-pn" }, tierChip(r.tier), " ", r.lcsc ? codeLink(r.lcsc) : searchLink(r.name.split(" ")[0], "search", true)));

    const fixedRow = (f) => h("button",
      { class: "regpick" + (kind === "fixed" && fixedSel === f.n ? " on" : "") + (!f.ok ? " out" : ""), onclick: () => this.select("fixed", f.n) },
      h("span", { class: "rp-name" }, f.n),
      h("span", { class: "rp-meta" }, h("span", { class: "rp-type" }, "fixed")),
      h("span", { class: "rp-pn" }, tierChip(f.tier), " ", codeLink(f.c)));

    const fits = [...adjFits.map(pickRow), ...fixFits.map(fixedRow)];
    const out = [...adjOut.map(pickRow), ...fixOut.map(fixedRow)];

    this.replaceChildren(
      h("div", { class: "secHead" }, "Regulator"),
      h("div", { class: "reglist" },
        ...fits,
        out.length > 0 ? h("button", { class: "regmore", onclick: () => this.dispatchEvent(new CustomEvent("toggle-showall", { bubbles: true, composed: true })) }, (showAll ? "▴ hide " : "▾ show ") + out.length + " out-of-range") : null,
        ...(showAll ? out : [])));
  }
}
customElements.define("part-picker", PartPicker);
