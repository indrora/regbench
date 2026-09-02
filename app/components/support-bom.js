import { Mustache } from "../lib/mustache.js";

const TEMPLATE = `
<section class="section">
  <h2 class="ptitle">{{title}}<span class="dim">— Basic-part picks</span></h2>
  <div class="bomGrid">
    <ul class="bom">
    {{#rows}}
      <li><span class="role">{{role}}</span><span>{{{primaryHtml}}}</span><span class="bomcode">{{{codeHtml}}}</span></li>
    {{/rows}}
    </ul>
    {{#hasSkus}}<div class="bomSkus tableWrap">{{{skuTableHtml}}}</div>{{/hasSkus}}
  </div>
  {{{siblingsHtml}}}
  {{#extra}}{{{.}}}{{/extra}}
</section>`;

/* Dumb BOM renderer — root builds `rows` ({role, primaryHtml, codeHtml}, both
   already-rendered HTML strings) and `extra` (a list of raw HTML strings)
   from whichever domain shape (reg.supportComponents vs. jellyFor()) it started from,
   so this component doesn't need to know the difference. It also carries the
   selected part's sourcing table + family/sibling links, which live here now
   (alongside the BOM they source) rather than up in the detail header. */
class SupportBom extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="select-sibling"]');
      if (!btn) return;
      this.dispatchEvent(new CustomEvent("part-select", { detail: { id: btn.dataset.id }, bubbles: true, composed: true }));
    });
  }

  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { title, rows, extra, skuTableHtml, siblingsHtml } = this;
    this.innerHTML = Mustache.render(TEMPLATE, {
      title: title || "Around the regulator ",
      rows, extra: extra || [],
      skuTableHtml: skuTableHtml || "", hasSkus: !!skuTableHtml,
      siblingsHtml: siblingsHtml || "",
    });
  }
}
customElements.define("support-bom", SupportBom);
