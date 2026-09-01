import { Mustache } from "./mustache.js";

export const parseRVal = (s) => {
  if (s.endsWith("M")) return parseFloat(s) * 1e6;
  if (s.endsWith("k")) return parseFloat(s) * 1e3;
  if (s.endsWith("m")) return parseFloat(s) * 1e-3;
  return parseFloat(s);
};

export const trim = (n) => {
  const s = n.toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

export const fmtOhm = (v) => {
  if (v >= 1e6) return trim(v / 1e6) + " MΩ";
  if (v >= 1e3) return trim(v / 1e3) + " kΩ";
  return trim(v) + " Ω";
};

export const fmtV = (v, d = 3) => {
  const a = Math.abs(v);
  const dd = a >= 10 ? Math.min(d, 2) : d;
  return v.toFixed(dd).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + " V";
};

export const partUrl = (c) => `https://jlcpcb.com/partdetail/${c}`;
export const jlcSearch = (q) => `https://jlcpcb.com/parts/componentSearch?searchTxt=${encodeURIComponent(q)}`;

/* Small Mustache-rendered HTML atoms. Escaping is automatic (Mustache
   escapes {{var}} by default), which is a real win over the old manual
   template-literal string-building for anything sourced from live JLCPCB
   data (part names, descriptions). */

const CODE_LINK_TPL = `<a class="code" href="{{url}}" target="_blank" rel="noreferrer" title="JLCPCB part detail (tier + stock)">{{code}}</a>`;
export const codeLink = (c) => c ? Mustache.render(CODE_LINK_TPL, { url: partUrl(c), code: c }) : "";

const SEARCH_LINK_TPL = `<a class="code" href="{{url}}" target="_blank" rel="noreferrer"{{#stop}} data-stop-propagation{{/stop}}>{{label}}</a>`;
export const searchLink = (q, label = "search", stop = false) =>
  Mustache.render(SEARCH_LINK_TPL, { url: jlcSearch(q), label, stop });

const TIER_TPL = `<span class="tier {{cls}}">{{label}}</span>`;
export const tierChip = (t) => Mustache.render(TIER_TPL,
  t === "Basic" ? { cls: "basic", label: "Basic" } :
  t === "Extended" ? { cls: "ext", label: "Extended" } :
  { cls: "unk", label: "code unverified" });

const FRAC_TPL = `<span class="frac"><span class="ft">{{{top}}}</span><span class="fb">{{{bot}}}</span></span>`;
export const fracEl = (top, bot) => Mustache.render(FRAC_TPL, { top, bot });

const SUB_TPL = `<sub>{{{t}}}</sub>`;
export const sub = (t) => Mustache.render(SUB_TPL, { t });

/* Family/variant detail-panel atoms (part of the family/version/SKU model:
   a variant's electrical fields stay a single flat object, but its sourcing
   is a real list now instead of one hardcoded LCSC code). */

const SKU_TABLE_TPL = `<table class="skutable">
<thead><tr><th>LCSC</th><th>package</th><th>manufacturer</th><th>tier</th></tr></thead>
<tbody>{{#rows}}<tr><td>{{{codeHtml}}}</td><td>{{package}}</td><td>{{manufacturer}}</td><td>{{{tierHtml}}}</td></tr>{{/rows}}</tbody>
</table>`;
export const skuTable = (skus) => {
  if (!skus || !skus.length) return `<div class="dim">No known JLCPCB stock for this variant — search manually.</div>`;
  return Mustache.render(SKU_TABLE_TPL, {
    rows: skus.map((s) => ({ codeHtml: codeLink(s.lcsc), package: s.package, manufacturer: s.manufacturer, tierHtml: tierChip(s.tier) })),
  });
};

const SIBLINGS_TPL = `<div class="dim siblings">Family: {{#siblings}}{{^first}} · {{/first}}<button type="button" class="siblink" data-action="select-sibling" data-id="{{id}}">{{name}}</button>{{/siblings}}</div>`;
export const siblingLinks = (siblings, selfId) => {
  const others = (siblings || []).filter((v) => v.id !== selfId);
  if (!others.length) return "";
  return Mustache.render(SIBLINGS_TPL, { siblings: others.map((v, i) => ({ first: i === 0, id: v.id, name: v.name })) });
};
