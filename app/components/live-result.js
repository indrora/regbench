import { Mustache } from "../lib/mustache.js";

/* The one thing a parametric tool never makes you scroll to find: what did
   my numbers actually produce. Sits in the sidebar right under the inputs
   that drive it, so the live output and the parameters stay co-located --
   the whole point of a parameter panel, not a page you read top to bottom. */
const TEMPLATE = `
<div class="section liveResult">
  <div class="secHead">Result</div>
  <div class="lrValue {{cls}}">{{value}}</div>
  <div class="dim">{{status}}</div>
</div>`;

class LiveResult extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { value, status, cls } = this;
    this.innerHTML = Mustache.render(TEMPLATE, { value, status, cls: cls || "" });
  }
}
customElements.define("live-result", LiveResult);
