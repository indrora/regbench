import { Mustache } from "../lib/mustache.js";
import { codeLink, searchLink, tierChip, fmtV, sub, skuTable, siblingLinks } from "../lib/format.js";

const TEMPLATE = `
<section class="panel regdetail">
  <div class="rd-head">
    <div><span class="rd-name">{{name}}</span><span class="rd-mfr">{{manufacturerNote}}</span></div>
    <span class="regchip">{{{tierHtml}}}{{{codeHtml}}}</span>
  </div>
  <div class="rd-spec">
    <span>{{topology}}</span><span>{{packageNote}}</span><span>{{limits}}</span>
    <span>{{{vrefHtml}}}</span>
  </div>
  {{#needsReview}}<div class="warn">⚠ Auto-discovered from JLCPCB stock data, not datasheet-verified — reference voltage / divider fields are unconfirmed. Check the manufacturer's datasheet before trusting this solver's output.</div>{{/needsReview}}
  {{{skuTableHtml}}}
  {{{siblingsHtml}}}
</section>`;

class RegulatorDetail extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="select-sibling"]');
      if (!btn) return;
      this.dispatchEvent(new CustomEvent("part-select", { detail: { id: btn.dataset.id }, bubbles: true, composed: true }));
    });
  }

  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { reg, vtolDisplay, siblings } = this;
    this.innerHTML = Mustache.render(TEMPLATE, {
      name: reg.name, manufacturerNote: reg.manufacturerNote,
      tierHtml: tierChip(reg.bestTier),
      codeHtml: reg.bestLcsc ? codeLink(reg.bestLcsc) : searchLink(reg.name.split(" ")[0], "search JLC"),
      topology: reg.topology, packageNote: reg.packageNote, limits: reg.limits,
      needsReview: !!reg.needsReview,
      vrefHtml: reg.referenceVoltage != null
        ? `V${sub("REF")} ${fmtV(reg.referenceVoltage)} ±${vtolDisplay} %`
        : `<span class="dim">V${sub("REF")} unknown — needs datasheet</span>`,
      skuTableHtml: skuTable(reg.skus),
      siblingsHtml: siblingLinks(siblings, reg.id),
    });
  }
}
customElements.define("regulator-detail", RegulatorDetail);
