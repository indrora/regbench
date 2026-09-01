import { Mustache } from "../lib/mustache.js";

const TEMPLATE = `
<section class="panel">
  <div class="ptitle">{{title}}<span class="dim">— Basic-part picks</span></div>
  <ul class="bom">
  {{#rows}}
    <li><span class="role">{{role}}</span><span>{{{primaryHtml}}}</span><span class="bomcode">{{{codeHtml}}}</span></li>
  {{/rows}}
  </ul>
  {{#extra}}{{{.}}}{{/extra}}
</section>`;

/* Dumb BOM renderer — root builds `rows` ({role, primaryHtml, codeHtml}, both
   already-rendered HTML strings) and `extra` (a list of raw HTML strings)
   from whichever domain shape (reg.supportComponents vs. jellyFor()) it started from,
   so this component doesn't need to know the difference. */
class SupportBom extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { title, rows, extra } = this;
    this.innerHTML = Mustache.render(TEMPLATE, {
      title: title || "Around the regulator ",
      rows, extra: extra || [],
    });
  }
}
customElements.define("support-bom", SupportBom);
