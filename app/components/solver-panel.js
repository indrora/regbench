import { Mustache } from "../lib/mustache.js";
import { fmtOhm, fmtV, fracEl, sub } from "../lib/format.js";

const TEMPLATE = `
<section class="panel hero">
  <div class="eq generic">
    V{{{subOut}}} = {{negSign}}V{{{subRef}}} · ( 1 + {{{fracRaRb}}} ){{#hasIadj}} + I{{{subIadj}}} · {{raName}}{{/hasIadj}}
  </div>
  <div class="eq subst">
    {{negSign}}{{vref}} V · ( 1 + {{{fracOhms}}} ){{#hasIadj}} + {{iadjTypStr}} µA · {{raOhmsStr}}{{/hasIadj}} = <b class="{{eqCls}}">{{negSign}}{{vStr}}</b>
  </div>
  <div class="wcline">
    target {{negSign}}{{vtStr}} · error {{errStr}} % · with {{tol}} % resistors &amp; {{vtol}} % V{{{subRef}}}: <b>{{negSign}}{{wcLoStr}} … {{negSign}}{{wcHiStr}}</b>{{#showIadjMax}}<span class="dim"> (upper bound includes I{{{subAdj}}} max {{iadjMaxStr}} µA)</span>{{/showIadjMax}}
  </div>
  <div class="schem-slot"></div>
  <div class="dim schemcap">{{raName}}: {{raPath}} · {{rbName}}: {{rbPath}} · divider current ≈ {{dividerMa}} mA</div>
</section>`;

class SolverPanel extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { reg, s, wc, vt, vtol, tol } = this;
    const okPct = this.okPct;
    const neg = reg.isNegative ? "−" : "";
    this.innerHTML = Mustache.render(TEMPLATE, {
      subOut: sub("OUT"), subRef: sub("REF"), subIadj: sub(reg.isShunt ? "REF" : "ADJ"), subAdj: sub("ADJ"),
      negSign: neg, fracRaRb: fracEl(reg.topResistorName, reg.bottomResistorName), fracOhms: fracEl(fmtOhm(s.raOhms), fmtOhm(s.rb.ohms)),
      hasIadj: reg.hasSignificantAdjustCurrent, raName: reg.topResistorName, rbName: reg.bottomResistorName, raPath: reg.topResistorPath, rbPath: reg.bottomResistorPath,
      vref: reg.referenceVoltage, iadjTypStr: reg.hasSignificantAdjustCurrent ? (reg.adjustCurrentTypical * 1e6).toFixed(0) : null, raOhmsStr: fmtOhm(s.raOhms),
      eqCls: Math.abs(s.err) <= okPct ? "ok" : "bad", vStr: fmtV(s.v),
      vtStr: fmtV(vt, 2), errStr: `${s.err >= 0 ? "+" : ""}${s.err.toFixed(2)}`, tol, vtol,
      wcLoStr: fmtV(wc[0]), wcHiStr: fmtV(wc[1]),
      showIadjMax: reg.hasSignificantAdjustCurrent && !reg.isShunt, iadjMaxStr: reg.hasSignificantAdjustCurrent ? (reg.adjustCurrentMax * 1e6).toFixed(0) : null,
      dividerMa: (reg.referenceVoltage / s.rb.ohms * 1000).toFixed(2),
    });
    this.querySelector(".schem-slot").replaceWith(this.schematic());
  }

  schematic() {
    const { reg } = this;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 560 96");
    svg.setAttribute("class", "schem");
    svg.setAttribute("aria-hidden", "true");
    const g1 = document.createElementNS(NS, "g");
    g1.setAttribute("stroke", "currentColor"); g1.setAttribute("stroke-width", "1.4"); g1.setAttribute("fill", "none");
    const lines = [[20, 48, 130, 48], [206, 48, 300, 48], [376, 48, 470, 48], [253, 48, 253, 20], [470, 48, 470, 66], [458, 66, 482, 66], [462, 72, 478, 72], [466, 78, 474, 78]];
    for (const [x1, y1, x2, y2] of lines) { const l = document.createElementNS(NS, "line"); l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); g1.append(l); }
    for (const [x, y, w] of [[130, 34, 76], [300, 34, 76]]) { const r = document.createElementNS(NS, "rect"); r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", 28); g1.append(r); }
    svg.append(g1);
    const g2 = document.createElementNS(NS, "g"); g2.setAttribute("class", "schemtxt");
    const txt = (x, y, str, anchor) => { const t = document.createElementNS(NS, "text"); t.setAttribute("x", x); t.setAttribute("y", y); if (anchor) t.setAttribute("text-anchor", anchor); t.textContent = str; g2.append(t); };
    txt(20, 40, reg.isShunt ? "VOUT (K)" : "VOUT");
    txt(168, 52, reg.bottomResistorPath.startsWith("VOUT") ? reg.bottomResistorName : reg.topResistorName, "middle");
    txt(338, 52, reg.bottomResistorPath.startsWith("VOUT") ? reg.topResistorName : reg.bottomResistorName, "middle");
    txt(253, 14, reg.isShunt ? "REF" : reg.topResistorPath.includes("ADJ") ? "ADJ" : "FB", "middle");
    txt(446, 40, "GND");
    svg.append(g2);
    return svg;
  }
}
customElements.define("solver-panel", SolverPanel);
