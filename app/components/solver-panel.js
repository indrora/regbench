import { h, frag } from "../lib/dom.js";
import { fmtOhm, fmtV, fracEl, sub } from "../lib/format.js";

class SolverPanel extends HTMLElement {
  update(props) { Object.assign(this, props); this.render(); }

  render() {
    const { reg, s, wc, vt, vtol, tol } = this;
    const okPct = this.okPct;
    const eqRes = h("span", { class: "eqres" }, " = ",
      h("b", { class: Math.abs(s.err) <= okPct ? "ok" : "bad" }, (reg.negative ? "−" : "") + fmtV(s.v)));
    this.replaceChildren(
      h("section", { class: "panel hero" },
        h("div", { class: "eq generic" },
          "V", sub("OUT"), " = " + (reg.negative ? "−" : ""), "V", sub("REF"), " · ( 1 + ", fracEl(reg.raName, reg.rbName), " )",
          reg.hasIadj ? frag(" + I", sub(reg.shunt ? "REF" : "ADJ"), " · " + reg.raName) : null),
        h("div", { class: "eq subst" },
          (reg.negative ? "−" : "") + reg.vref + " V · ( 1 + ", fracEl(fmtOhm(s.raOhms), fmtOhm(s.rb.ohms)), " )",
          reg.hasIadj ? ` + ${(reg.iadjTyp * 1e6).toFixed(0)} µA · ${fmtOhm(s.raOhms)}` : null, eqRes),
        h("div", { class: "wcline" },
          `target ${reg.negative ? "−" : ""}${fmtV(vt, 2)} · error ${s.err >= 0 ? "+" : ""}${s.err.toFixed(2)} % · with ${tol} % resistors & ${vtol} % `,
          "V", sub("REF"), ": ",
          h("b", {}, `${reg.negative ? "−" : ""}${fmtV(wc[0])} … ${reg.negative ? "−" : ""}${fmtV(wc[1])}`),
          reg.hasIadj && !reg.shunt ? h("span", { class: "dim" }, frag(" (upper bound includes I", sub("ADJ"), ` max ${(reg.iadjMax * 1e6).toFixed(0)} µA)`)) : null),
        this.schematic(),
        h("div", { class: "dim schemcap" },
          `${reg.raName}: ${reg.raPath} · ${reg.rbName}: ${reg.rbPath} · divider current ≈ ${(reg.vref / s.rb.ohms * 1000).toFixed(2)} mA`)));
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
    txt(20, 40, reg.shunt ? "VOUT (K)" : "VOUT");
    txt(168, 52, reg.rbPath.startsWith("VOUT") ? reg.rbName : reg.raName, "middle");
    txt(338, 52, reg.rbPath.startsWith("VOUT") ? reg.raName : reg.rbName, "middle");
    txt(253, 14, reg.shunt ? "REF" : reg.raPath.includes("ADJ") ? "ADJ" : "FB", "middle");
    txt(446, 40, "GND");
    svg.append(g2);
    return svg;
  }
}
customElements.define("solver-panel", SolverPanel);
