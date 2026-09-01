import { Mustache } from "../lib/mustache.js";
import { withFocusPreserved } from "../lib/focus.js";
import { sub } from "../lib/format.js";

const TEMPLATE = `
<div class="secHead">Requirements</div>
<div class="grid2">
  <label class="lbl">Target V{{{subOut}}}<input inputmode="decimal" data-focus-key="vtS" data-key="vtS" value="{{vtS}}"></label>
  <label class="lbl">V{{{subIn}}}<input inputmode="decimal" data-focus-key="vinS" data-key="vinS" value="{{vinS}}"></label>
  <label class="lbl">I{{{subOut}}} (A)<input inputmode="decimal" data-focus-key="ioutS" data-key="ioutS" value="{{ioutS}}"></label>
</div>`;

class RequirementsForm extends HTMLElement {
  connectedCallback() {
    this.addEventListener("input", (e) => {
      const key = e.target.dataset.key;
      if (!key) return;
      this.dispatchEvent(new CustomEvent("requirements-change", { detail: { key, value: e.target.value }, bubbles: true, composed: true }));
    });
  }

  update(props) { Object.assign(this, props); this.render(); }

  render() {
    withFocusPreserved(this, () => {
      this.innerHTML = Mustache.render(TEMPLATE, {
        vtS: this.vtS, vinS: this.vinS, ioutS: this.ioutS,
        subOut: sub("OUT"), subIn: sub("IN"),
      });
    });
  }
}
customElements.define("requirements-form", RequirementsForm);
