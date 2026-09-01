import { Mustache } from "../lib/mustache.js";
import { withFocusPreserved } from "../lib/focus.js";
import { codeLink, searchLink, tierChip } from "../lib/format.js";
import { allVariants, variantFits, topoTag } from "../lib/solver.js";

const ROW_TPL = `<button class="{{cls}}" data-action="select" data-id="{{id}}">
  <span class="rp-name">{{name}}</span>
  <span class="rp-meta">{{{metaHtml}}}</span>
  <span class="rp-pn">{{{pnHtml}}}</span>
</button>`;

const META_TPL = `<span class="rp-vendor">{{note}}</span><span class="rp-type">{{type}}</span>`;

/* One family header + its member rows for the current bucket (fits/out).
   A family with a single variant just reads as a plain row with no visual
   header overhead -- grouping only shows up once there's something to group. */
const FAMILY_GROUP_TPL = `<div class="famgroup">
  {{#showHeader}}<div class="famhead">{{familyName}}</div>{{/showHeader}}
  {{#rows}}{{> row}}{{/rows}}
</div>`;

const TEMPLATE = `
<div class="secHead">Regulator</div>
<div class="reglist">
{{#fitGroups}}{{> group}}{{/fitGroups}}
{{#hasOut}}<button class="regmore" data-action="toggle-showall">{{showMoreLabel}}</button>{{/hasOut}}
{{#showAll}}{{#outGroups}}{{> group}}{{/outGroups}}{{/showAll}}
</div>`;

class PartPicker extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", (e) => {
      if (e.target.closest("[data-stop-propagation]")) return;
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "select") this.select(btn.dataset.id);
      else if (action === "toggle-showall") this.dispatchEvent(new CustomEvent("toggle-showall", { bubbles: true, composed: true }));
    });
  }

  update(props) { Object.assign(this, props); this.render(); }

  select(id) {
    this.dispatchEvent(new CustomEvent("part-select", { detail: { id }, bubbles: true, composed: true }));
  }

  render() {
    withFocusPreserved(this, () => {
      this.innerHTML = Mustache.render(TEMPLATE, this.viewModel(), { row: ROW_TPL, group: FAMILY_GROUP_TPL });
    });
  }

  /* groups a flat variant list into per-family blocks, in family-appearance
     order; a family only gets a visible header once it has 2+ rows in this
     particular bucket (fits vs out get grouped independently). */
  groupByFamily(variants, isOut) {
    const order = [];
    const byFamily = new Map();
    for (const v of variants) {
      if (!byFamily.has(v.familyId)) { byFamily.set(v.familyId, []); order.push(v.familyId); }
      byFamily.get(v.familyId).push(v);
    }
    return order.map((familyId) => {
      const members = byFamily.get(familyId);
      return {
        familyName: members[0].familyName,
        showHeader: members.length > 1,
        rows: members.map((v) => this.variantRow(v, isOut)),
      };
    });
  }

  variantRow(v, isOut) {
    const note = v.kind === "fixed"
      ? `fixed ${v.vOutFixed} V${v.needsReview ? " · needs review" : ""}`
      : `${topoTag(v)}${v.needsReview ? " · needs review" : ""}`;
    return {
      cls: "regpick" + (this.selectedId === v.id ? " on" : "") + (isOut ? " out" : "") + (v.needsReview ? " needsreview" : ""),
      id: v.id, name: v.name,
      metaHtml: Mustache.render(META_TPL, { note, type: v.kind === "fixed" ? "fixed" : topoTag(v) }),
      pnHtml: tierChip(v.bestTier) + " " + (v.bestLcsc ? codeLink(v.bestLcsc) : searchLink(v.name.split(" ")[0], "search", true)),
    };
  }

  viewModel() {
    const { families, vt, vin, iout, showAll } = this;
    const variants = allVariants(families);

    const fits = variants.filter((v) => variantFits(v, vt, vin, iout));
    const out = variants.filter((v) => !variantFits(v, vt, vin, iout));

    return {
      fitGroups: this.groupByFamily(fits, false),
      outGroups: this.groupByFamily(out, true),
      hasOut: out.length > 0, showAll,
      showMoreLabel: (showAll ? "▴ hide " : "▾ show ") + out.length + " out-of-range",
    };
  }
}
customElements.define("part-picker", PartPicker);
