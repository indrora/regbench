import { Mustache } from "../lib/mustache.js";
import { codeLink, searchLink, tierChip, fmtV, sub } from "../lib/format.js";

const TEMPLATE = `
<section class="section regdetail">
  <div class="rd-head">
    <div><h2 class="rd-name">{{name}}</h2><span class="rd-mfr">{{manufacturerNote}}</span></div>
    <span class="regchip">{{{tierHtml}}}{{{codeHtml}}}</span>
  </div>
  <div class="rd-spec">
    <span>{{topology}}</span><span>{{packageNote}}</span><span>{{limits}}</span>
    <span>{{{vrefHtml}}}</span>
  </div>
  {{#needsReview}}<div class="warn">⚠ Auto-discovered from JLCPCB stock data, not datasheet-verified — reference voltage / divider fields are unconfirmed. Check the manufacturer's datasheet before trusting this solver's output.</div>{{/needsReview}}
</section>`;

class RegulatorDetail extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { reg, vtolDisplay } = this;
    this.innerHTML = Mustache.render(TEMPLATE, {
      name: reg.name, manufacturerNote: reg.manufacturerNote,
      tierHtml: tierChip(reg.bestTier),
      codeHtml: reg.bestLcsc ? codeLink(reg.bestLcsc) : searchLink(reg.name.split(" ")[0], "search JLC"),
      topology: reg.topology, packageNote: reg.packageNote, limits: reg.limits,
      needsReview: !!reg.needsReview,
      vrefHtml: reg.referenceVoltage != null
        ? `V${sub("REF")} ${fmtV(reg.referenceVoltage)} ±${vtolDisplay} %`
        : `<span class="dim">V${sub("REF")} unknown — needs datasheet</span>`,
    });
  }
}
customElements.define("regulator-detail", RegulatorDetail);
