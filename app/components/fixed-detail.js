import { h } from "../lib/dom.js";
import { codeLink, tierChip, fmtV } from "../lib/format.js";
import { railMatch } from "../lib/solver.js";

class FixedDetail extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { f, vt } = this;
    const onRail = railMatch(f, vt);
    this.replaceChildren(
      h("section", { class: "panel regdetail" },
        h("div", { class: "rd-head" },
          h("div", {}, h("span", { class: "rd-name" }, f.n)),
          h("span", { class: "regchip" }, tierChip(f.tier), codeLink(f.c))),
        h("div", { class: "rd-spec" },
          h("span", {}, f.d), h("span", {}, `${f.i} A max`), h("span", {}, `Vin ≤ ${f.vim} V`),
          f.t === "lin" ? h("span", {}, `Pd ≤ ${f.pd} W`) : null),
        h("div", { class: "rd-spec" },
          h("span", { class: "chip " + (f.iok ? "pass" : "fail") }, f.iok ? "current fits" : `${f.i} A max`),
          h("span", { class: "chip " + (f.pok ? "pass" : "fail") }, f.pok ? "power OK" : "too hot"),
          h("span", { class: "chip " + (f.vok ? "pass" : "fail") }, f.vok ? "Vin OK" : "Vin too high")),
        !onRail ? h("div", { class: "warn" }, `This is a fixed ${fmtV(f.v)} part — current target is ${fmtV(vt, 2)}, so it won't produce that rail. Pick a different target or regulator.`) : null));
  }
}
customElements.define("fixed-detail", FixedDetail);
