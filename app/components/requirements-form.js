import { Mustache } from "../lib/mustache.js";
import { withFocusPreserved } from "../lib/focus.js";
import { sub } from "../lib/format.js";

const TEMPLATE = `
<div class="secHead">Requirements</div>
<div class="stack">
  <label class="lbl"><span>Target V{{{subOut}}}</span><input type="number" step="0.1" name="vtS" data-focus-key="vtS" data-key="vtS" value="{{vtS}}"></label>
  <label class="lbl"><span>V{{{subIn}}}</span><input type="number" step="0.1" name="vinS" data-focus-key="vinS" data-key="vinS" value="{{vinS}}"></label>
  <label class="lbl"><span>I{{{subOut}}} (A)</span><input name="ioutS" inputmode="decimal" data-focus-key="ioutS" data-key="ioutS" value="{{ioutS}}"></label>
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
