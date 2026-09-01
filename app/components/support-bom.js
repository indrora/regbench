import { h } from "../lib/dom.js";

/* Dumb BOM renderer — root builds `rows` ({role, primary, code}) from
   whichever domain shape (reg.support vs. jellyFor()) it started from, so
   this component doesn't need to know the difference. */
class SupportBom extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { title, rows, extra } = this;
    this.replaceChildren(
      h("section", { class: "panel" },
        h("div", { class: "ptitle" }, title || "Around the regulator ", h("span", { class: "dim" }, "— Basic-part picks")),
        h("ul", { class: "bom" }, ...rows.map((row) =>
          h("li", {}, h("span", { class: "role" }, row.role), h("span", {}, row.primary), h("span", { class: "bomcode" }, row.code)))),
        ...(extra || [])));
  }
}
customElements.define("support-bom", SupportBom);
