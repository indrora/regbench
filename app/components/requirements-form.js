import { h } from "../lib/dom.js";
import { sub } from "../lib/format.js";

class RequirementsForm extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  emit(key, value) {
    this.dispatchEvent(new CustomEvent("requirements-change", { detail: { key, value }, bubbles: true, composed: true }));
  }

  render() {
    const num = (label, key) => h("label", { class: "lbl" }, ...label,
      h("input", { inputmode: "decimal", value: this[key], "data-focus-key": key, oninput: (e) => this.emit(key, e.target.value) }));
    this.replaceChildren(
      h("div", { class: "secHead" }, "Requirements"),
      h("div", { class: "grid2" },
        num(["Target V", sub("OUT")], "vtS"),
        num(["V", sub("IN")], "vinS"),
        num(["I", sub("OUT"), " (A)"], "ioutS")));
  }
}
customElements.define("requirements-form", RequirementsForm);
