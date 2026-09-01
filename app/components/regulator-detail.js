import { h } from "../lib/dom.js";
import { codeLink, searchLink, tierChip, fmtV, sub } from "../lib/format.js";

class RegulatorDetail extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { reg, vtolDisplay } = this;
    this.replaceChildren(
      h("section", { class: "panel regdetail" },
        h("div", { class: "rd-head" },
          h("div", {}, h("span", { class: "rd-name" }, reg.name), h("span", { class: "rd-mfr" }, reg.mfr)),
          h("span", { class: "regchip" }, tierChip(reg.tier), reg.lcsc ? codeLink(reg.lcsc) : searchLink(reg.name.split(" ")[0], "search JLC"))),
        h("div", { class: "rd-spec" },
          h("span", {}, reg.topo), h("span", {}, reg.pkgNote), h("span", {}, reg.limits),
          h("span", {}, "V", sub("REF"), " " + fmtV(reg.vref) + " ±" + vtolDisplay + " %"))));
  }
}
customElements.define("regulator-detail", RegulatorDetail);
