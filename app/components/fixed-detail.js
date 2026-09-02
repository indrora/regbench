import { Mustache } from "../lib/mustache.js";
import { codeLink, tierChip, fmtV } from "../lib/format.js";
import { railMatch } from "../lib/solver.js";

const TEMPLATE = `
<section class="section regdetail">
  <div class="rd-head">
    <div><h2 class="rd-name">{{name}}</h2></div>
    <span class="regchip">{{{tierHtml}}}{{{codeHtml}}}</span>
  </div>
  <div class="rd-spec">
    <span>{{description}}</span><span>{{iOutMax}} A max</span><span>Vin ≤ {{vInMax}} V</span>
    {{#isLinear}}<span>Pd ≤ {{powerDissipationMax}} W</span>{{/isLinear}}
  </div>
  <div class="rd-spec">
    <span class="chip {{iCls}}">{{iLabel}}</span>
    <span class="chip {{pCls}}">{{pLabel}}</span>
    <span class="chip {{vCls}}">{{vLabel}}</span>
  </div>
  {{^onRail}}<div class="warn">This is a fixed {{vStr}} part — current target is {{vtStr}}, so it won't produce that rail. Pick a different target or regulator.</div>{{/onRail}}
  {{#needsReview}}<div class="warn">⚠ Auto-discovered from JLCPCB stock data, not datasheet-verified — output voltage / current figures are unconfirmed.</div>{{/needsReview}}
</section>`;

class FixedDetail extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { f, vt } = this;
    this.innerHTML = Mustache.render(TEMPLATE, {
      name: f.name, tierHtml: tierChip(f.bestTier), codeHtml: codeLink(f.bestLcsc),
      description: f.description, iOutMax: f.iOutMax, vInMax: f.vInMax, powerDissipationMax: f.powerDissipationMax,
      isLinear: f.converterType === "linear",
      iCls: f.iok ? "pass" : "fail", iLabel: f.iok ? "current fits" : `${f.iOutMax} A max`,
      pCls: f.pok ? "pass" : "fail", pLabel: f.pok ? "power OK" : "too hot",
      vCls: f.vok ? "pass" : "fail", vLabel: f.vok ? "Vin OK" : "Vin too high",
      onRail: railMatch(f, vt), vStr: fmtV(f.vOutFixed), vtStr: fmtV(vt, 2),
      needsReview: !!f.needsReview,
    });
  }
}
customElements.define("fixed-detail", FixedDetail);
