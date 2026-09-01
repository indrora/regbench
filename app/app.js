/* REGULATOR DIVIDER SOLVER — Web Components edition.
   No framework. One custom element <regulator-solver> owns a small reactive
   state object and rebuilds its DOM on change. Data comes from data.json.
   All engineering logic (solver, worst-case, fit predicate) is ported
   verbatim from the original React implementation. */

/* ============================ helpers ============================ */
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "onclick" || k === "oninput" || k === "onchange") el.addEventListener(k.slice(2), v);
    else if (k === "for") el.htmlFor = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};
const frag = (...kids) => { const f = document.createDocumentFragment(); for (const k of kids.flat()) { if (k == null || k === false) continue; f.append(k.nodeType ? k : document.createTextNode(String(k))); } return f; };

const parseRVal = (s) => {
  if (s.endsWith("M")) return parseFloat(s) * 1e6;
  if (s.endsWith("k")) return parseFloat(s) * 1e3;
  if (s.endsWith("m")) return parseFloat(s) * 1e-3;
  return parseFloat(s);
};
const trim = (n) => {
  const s = n.toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};
const fmtOhm = (v) => {
  if (v >= 1e6) return trim(v / 1e6) + " MΩ";
  if (v >= 1e3) return trim(v / 1e3) + " kΩ";
  return trim(v) + " Ω";
};
const fmtV = (v, d = 3) => {
  const a = Math.abs(v);
  const dd = a >= 10 ? Math.min(d, 2) : d;
  return v.toFixed(dd).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + " V";
};

const partUrl = (c) => `https://jlcpcb.com/partdetail/${c}`;
const jlcSearch = (q) => `https://jlcpcb.com/parts/componentSearch?searchTxt=${encodeURIComponent(q)}`;

/* small DOM atoms mirroring the old React ones */
const codeLink = (c) => c
  ? h("a", { class: "code", href: partUrl(c), target: "_blank", rel: "noreferrer", title: "JLCPCB part detail (tier + stock)" }, c)
  : null;
const searchLink = (q, label = "search", stop = false) =>
  h("a", { class: "code", href: jlcSearch(q), target: "_blank", rel: "noreferrer", onclick: stop ? (e) => e.stopPropagation() : null }, label);
const tierChip = (t) =>
  t === "Basic" ? h("span", { class: "tier basic" }, "Basic") :
  t === "Extended" ? h("span", { class: "tier ext" }, "Extended") :
  h("span", { class: "tier unk" }, "code unverified");
const fracEl = (top, bot) => h("span", { class: "frac" }, h("span", { class: "ft" }, top), h("span", { class: "fb" }, bot));
const sub = (t) => h("sub", {}, t);

/* ============================ derived data ============================ */
function buildResistors(RDATA) {
  return Object.entries(RDATA)
    .map(([label, pkgs]) => ({ label, ohms: parseRVal(label), pkgs }))
    .filter((r) => r.ohms > 0)
    .sort((a, b) => a.ohms - b.ohms);
}

function jellyFor(JELLY, n) {
  if (n.startsWith("LM2596")) return JELLY.lm2596;
  if (n.startsWith("LM2576")) return JELLY.lm2576;
  if (n.startsWith("XL1509") || n.startsWith("XXL1509")) return JELLY.xl1509;
  if (n.startsWith("TPS620")) return JELLY.tps620;
  if (n.startsWith("AMS1117")) return JELLY.ldo1117;
  if (n.startsWith("L78M")) return JELLY.ldo78m;
  return JELLY.ldoSmall;
}

/* ============================ fit / topology ============================ */
function regFits(r, vt, vin, iout) {
  if (vt <= r.minV) return false;
  const lim = r.limits || "";
  const vinM = /Vin\s*([\d.]+)[–-]([\d.]+)\s*V/.exec(lim);
  if (vinM && (vin < parseFloat(vinM[1]) || vin > parseFloat(vinM[2]))) return false;
  const vinLe = /Vin\s*≤\s*([\d.]+)/.exec(lim);
  if (vinLe && vin > parseFloat(vinLe[1])) return false;
  const aM = /([\d.]+)\s*(m?)A/i.exec(lim);
  if (aM && iout > parseFloat(aM[1]) * (aM[2] ? 0.001 : 1)) return false;
  const voM = /Vout[^·]*?([\d.]+)[–-]([\d.]+)/.exec(lim);
  if (voM && vt > parseFloat(voM[2])) return false;
  const voLe = /Vout\s*≤\s*([\d.]+)/.exec(lim);
  if (voLe && vt > parseFloat(voLe[1])) return false;
  const canStepUp = r.boost || /boost|invert|buck.?boost/i.test(r.topo);
  const canStepDown = !r.boost && (/buck|linear|ldo|invert/i.test(r.topo));
  const eq = Math.abs(vin - vt) < 0.3;
  if (eq) { if (!(/buck.?boost|buck \/ boost|invert/i.test(r.topo))) return false; }
  else if (vin < vt) { if (!canStepUp) return false; }
  else { if (!canStepDown) return false; }
  if (vin > vt) {
    if (r.topo.startsWith("Buck") && vin < vt + 1.2) return false;
    if (r.topo.startsWith("Linear") && (vin < vt + 1.5 || (vin - vt) * iout > 5)) return false;
  }
  return true;
}
const topoTag = (r) =>
  /buck.?boost|buck \/ boost/i.test(r.topo) ? "buck-boost" :
  r.topo.startsWith("Linear") ? "LDO/linear" :
  r.topo.startsWith("Buck") ? "buck" :
  r.boost ? "boost" :
  r.topo.startsWith("Shunt") ? "shunt ref" : "other";

/* ============================ solver ============================ */
const voutOf = (reg, ra, rb) => reg.vref * (1 + ra / rb) + (reg.iadjTyp || 0) * ra;

function worstCase(reg, ra, rb, tolPct, vtolPct) {
  const t = tolPct / 100, v = vtolPct / 100;
  const hi = reg.vref * (1 + v) * (1 + (ra * (1 + t)) / (rb * (1 - t))) + (reg.iadjMax || 0) * ra * (1 + t);
  const lo = reg.vref * (1 - v) * (1 + (ra * (1 - t)) / (rb * (1 + t)));
  return [lo, hi];
}

const COMMON = new Set(["1k", "2.2k", "4.7k", "10k", "22k", "47k", "100k", "100", "220", "240", "330", "470", "1.5k", "3.3k", "120", "1.2k", "680", "2k", "5.1k", "20k"]);
const niceness = (labels) => labels.reduce((s, l) => s + (COMMON.has(l) ? 0 : 1), 0);

function nearest(sorted, target) {
  if (target <= 0) return null;
  let lo = 0, hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].ohms < target) lo = mid + 1; else hi = mid;
  }
  const a = sorted[lo], b = sorted[lo - 1];
  if (!b) return a;
  return Math.abs(a.ohms - target) < Math.abs(b.ohms - target) ? a : b;
}

function solve(RESISTORS, reg, vt, allowPairs) {
  const inRange = RESISTORS.filter((r) => r.ohms >= reg.rbRange[0] && r.ohms <= reg.rbRange[1]);
  const sols = [];
  const push = (raParts, mode, raOhms, rb) => {
    const v = voutOf(reg, raOhms, rb.ohms);
    const err = ((v - vt) / vt) * 100;
    if (Math.abs(err) > 25) return;
    sols.push({ raParts, mode, raOhms, rb, v, err, n: raParts.length + 1 });
  };
  for (const rb of inRange) for (const ra of RESISTORS) push([ra], "single", ra.ohms, rb);
  if (allowPairs) {
    const vals = RESISTORS;
    for (const rb of inRange) {
      const need = (vt - reg.vref) / (reg.vref / rb.ohms + (reg.iadjTyp || 0));
      if (need <= 0) continue;
      for (const p of vals) {
        if (p.ohms >= need) break;
        const q = nearest(vals, need - p.ohms);
        if (q && q.ohms >= p.ohms) push([p, q], "series", p.ohms + q.ohms, rb);
      }
      for (const p of vals) {
        if (p.ohms <= need) continue;
        const qTarget = (need * p.ohms) / (p.ohms - need);
        if (qTarget < p.ohms) continue;
        const q = nearest(vals, qTarget);
        if (q) push([p, q], "parallel", (p.ohms * q.ohms) / (p.ohms + q.ohms), rb);
      }
    }
  }
  sols.sort((a, b) => {
    const d = Math.abs(a.err) - Math.abs(b.err);
    if (Math.abs(d) > 1e-4) return d;
    if (a.n !== b.n) return a.n - b.n;
    return niceness([...a.raParts.map((x) => x.label), a.rb.label]) - niceness([...b.raParts.map((x) => x.label), b.rb.label]);
  });
  const seen = new Set(), out = [];
  for (const s of sols) {
    const key = s.raParts.map((x) => x.label).sort().join("+") + s.mode + "/" + s.rb.label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

const LSTD = [1, 1.5, 2.2, 3.3, 4.7, 6.8, 10, 15, 22, 33, 47, 68, 100, 150, 220, 330];
function suggestL(reg, vt, vin, iout) {
  if (!reg.fsw || reg.boost || reg.shunt || !vin || vin <= vt) return null;
  const dI = Math.max(0.3 * iout, 0.1);
  const L = (vt * (vin - vt)) / (vin * reg.fsw * dI) * 1e6;
  const pick = LSTD.reduce((b, x) => (Math.abs(x - L) < Math.abs(b - L) ? x : b), LSTD[0]);
  const ipk = iout + dI / 2;
  return { pick, ipk };
}

const partsStr = (s) =>
  s.mode === "single" ? s.raParts[0].label :
  s.raParts.map((x) => x.label).join(s.mode === "series" ? " + " : " ∥ ");
const rbCode = (r) => r.pkgs["0603"] || Object.values(r.pkgs)[0];

/* ============================ the element ============================ */
class RegulatorSolver extends HTMLElement {
  constructor() {
    super();
    this.state = { regId: "lm317", vtS: "5", vinS: "12", ioutS: "1", tol: 1, okPct: 2, pairs: true, vtolS: null, sel: 0, showAll: false };
    this.data = null;
  }

  async connectedCallback() {
    const url = this.getAttribute("data-src") || "data.json";
    try {
      this.data = await (await fetch(url)).json();
    } catch (e) {
      this.append(h("div", { class: "panel empty" }, "Could not load data.json — serve this over http, not file://."));
      return;
    }
    this.RESISTORS = buildResistors(this.data.resistors);
    this.render();
  }

  set(patch) { Object.assign(this.state, patch); this.render(); }

  /* derived snapshot for the current state */
  derive() {
    const S = this.state, D = this.data;
    const reg = D.regulators.find((r) => r.id === S.regId);
    const vt = Math.abs(parseFloat(S.vtS)) || 0;
    const vin = parseFloat(S.vinS) || 0;
    const iout = parseFloat(S.ioutS) || 0.5;
    const vtol = S.vtolS === null ? reg.vrefTol : parseFloat(S.vtolS) || 0;
    const sols = vt > reg.minV ? solve(this.RESISTORS, reg, vt, S.pairs) : [];
    const s = sols[Math.min(S.sel, Math.max(sols.length - 1, 0))];
    const wc = s ? worstCase(reg, s.raOhms, s.rb.ohms, S.tol, vtol) : null;
    const stepDown = vt > 0 && vin > vt + 0.1;
    const fixedHits = (stepDown ? D.fixed : [])
      .filter((f) => vt > 0 && Math.abs(f.v - vt) / vt < 0.01)
      .map((f) => {
        const pdiss = f.t === "lin" ? Math.max(vin - f.v, 0) * iout : 0;
        const iok = iout <= f.i, pok = f.t !== "lin" || pdiss <= f.pd, vok = vin <= f.vim;
        return { ...f, pdiss, iok, pok, vok, ok: iok && pok && vok };
      })
      .sort((a, b) => (b.ok - a.ok) || (b.i - a.i) || ((a.tier === "Basic" ? 0 : 1) - (b.tier === "Basic" ? 0 : 1)));
    const fixedOk = fixedHits.filter((f) => f.ok);
    const L = suggestL(reg, vt, vin, iout);
    const amaxM = /([\d.]+)\s*A/.exec(reg.limits || "");
    const amax = amaxM ? parseFloat(amaxM[1]) : null;
    const overI = amax != null && iout > amax;
    return { reg, vt, vin, iout, vtol, sols, s, wc, fixedHits, fixedOk, L, amax, overI };
  }

  render() {
    const S = this.state, D = this.data, R = this.derive();
    this.replaceChildren(
      h("header", {},
        h("div", { class: "hname" }, D.meta.title),
        h("div", { class: "hsub" }, D.meta.subtitle)),
      h("div", { class: "cols" }, this.sidebar(R), this.body(R))
    );
  }

  /* ---------------- sidebar ---------------- */
  sidebar(R) {
    const S = this.state, D = this.data;
    const { reg, vt, vin, iout } = R;
    const fits = D.regulators.filter((r) => regFits(r, vt, vin, iout));
    const out = D.regulators.filter((r) => !regFits(r, vt, vin, iout));

    const pickRow = (r) => h("button",
      { class: "regpick" + (S.regId === r.id ? " on" : "") + (out.includes(r) ? " out" : ""), onclick: () => this.set({ regId: r.id, sel: 0, vtolS: null }) },
      h("span", { class: "rp-name" }, r.name),
      h("span", { class: "rp-meta" }, h("span", { class: "rp-vendor" }, r.mfr), h("span", { class: "rp-type" }, topoTag(r))),
      h("span", { class: "rp-pn" }, tierChip(r.tier), " ", r.lcsc ? codeLink(r.lcsc) : searchLink(r.name.split(" ")[0], "search", true))
    );

    const num = (label, key, extra = {}) => h("label", { class: "lbl" }, frag(...label),
      h("input", { inputmode: "decimal", value: this.state[key], oninput: (e) => this.set({ [key]: e.target.value, ...(extra.resetSel ? { sel: 0 } : {}) }) }));

    return h("aside", { class: "panel controls" },
      h("div", { class: "secHead" }, "Requirements"),
      h("div", { class: "grid2" },
        num(["Target V", sub("OUT")], "vtS", { resetSel: true }),
        num(["V", sub("IN")], "vinS"),
        num(["I", sub("OUT"), " (A)"], "ioutS")),

      h("div", { class: "secHead" }, "Regulator"),
      h("div", { class: "reglist" },
        ...fits.map(pickRow),
        out.length > 0 ? h("button", { class: "regmore", onclick: () => this.set({ showAll: !S.showAll }) }, (S.showAll ? "▴ hide " : "▾ show ") + out.length + " out-of-range") : null,
        ...(S.showAll ? out.map(pickRow) : [])),

      h("div", { class: "secHead" }, "Tolerances — adjustable divider"),
      h("div", { class: "grid2" },
        h("label", { class: "lbl" }, "R tolerance",
          h("select", { onchange: (e) => this.set({ tol: parseFloat(e.target.value) }) },
            ...[[0.1, "0.1 %"], [0.5, "0.5 %"], [1, "1 % (Basic)"], [5, "5 %"]].map(([v, t]) =>
              h("option", { value: v, ...(S.tol === v ? { selected: true } : {}) }, t)))),
        h("label", { class: "lbl" }, frag("V", sub("REF"), " tol %"),
          h("input", { inputmode: "decimal", value: S.vtolS === null ? reg.vrefTol : S.vtolS, oninput: (e) => this.set({ vtolS: e.target.value }) })),
        h("label", { class: "lbl" }, "Close enough ±%",
          h("input", { inputmode: "decimal", value: S.okPct, oninput: (e) => this.set({ okPct: parseFloat(e.target.value) || 0 }) }))),

      h("label", { class: "chk" },
        h("input", { type: "checkbox", ...(S.pairs ? { checked: true } : {}), onchange: (e) => this.set({ pairs: e.target.checked, sel: 0 }) }),
        `Allow two-resistor combos (series / ∥) on ${reg.raName}`),

      h("div", { class: "rbnote dim" },
        `${reg.rbName} (${reg.rbPath}) constrained to ${fmtOhm(reg.rbRange[0])}–${fmtOhm(reg.rbRange[1])} — ${reg.rbHint}.`)
    );
  }

  /* ---------------- body ---------------- */
  body(R) {
    const S = this.state, D = this.data;
    const { reg, vt, vin, iout, vtol, sols, s, wc, fixedHits, fixedOk, L, amax, overI } = R;

    /* selected-regulator detail card */
    const detail = h("section", { class: "panel regdetail" },
      h("div", { class: "rd-head" },
        h("div", {}, h("span", { class: "rd-name" }, reg.name), h("span", { class: "rd-mfr" }, reg.mfr)),
        h("span", { class: "regchip" }, tierChip(reg.tier), reg.lcsc ? codeLink(reg.lcsc) : searchLink(reg.name.split(" ")[0], "search JLC"))),
      h("div", { class: "rd-spec" },
        h("span", {}, reg.topo), h("span", {}, reg.pkgNote), h("span", {}, reg.limits),
        h("span", {}, frag("V", sub("REF"), " " + fmtV(reg.vref) + " ±" + (S.vtolS === null ? reg.vrefTol : S.vtolS) + " %"))),
      fixedHits.length > 0 ? h("div", { class: "rd-fixed" },
        h("div", { class: "secHead" }, "Fixed alternatives at " + fmtV(vt, 2)),
        h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "part"), h("th", {}, "rating"), h("th", {}, "part #"), h("th", {}, "fit"))),
          h("tbody", {}, ...fixedHits.map((f) => h("tr", { class: f.ok ? "" : "dimrow" },
            h("td", {}, h("span", { class: "rv" }, f.n), (f.ok && fixedOk[0] === f)
              ? h("div", { class: "codes dim" }, "with ", ...jellyFor(D.jelly, f.n).map(([role, p, note], j) =>
                  h("span", {}, j > 0 ? " · " : "", role + ": ",
                    typeof p === "string" ? searchLink(p.split(" ≥")[0] + " inductor", p) : codeLink(p.c),
                    note ? ` (${note})` : "")))
              : null),
            h("td", { class: "dim" }, `${f.i} A · ${f.d}` + (f.t === "lin" && f.pdiss > 0.05 ? ` · ≈${f.pdiss.toFixed(1)} W` : "")),
            h("td", {}, tierChip(f.tier === "search" ? null : f.tier), " ", f.c ? codeLink(f.c) : searchLink(f.n)),
            h("td", {}, f.ok ? h("span", { class: "chip pass" }, "fits")
              : h("span", { class: "chip fail" }, !f.iok ? `${f.i} A max` : !f.pok ? "too hot" : "Vin")))))))
        : null);

    const overBanner = overI ? h("div", { class: "banner", style: "border-color:var(--red,#c0392b)" },
      h("b", {}, "⚠ Over-rated:"),
      ` you asked for ${iout} A but the ${reg.name} is a ${amax} A part (${reg.limits}). Pick something bigger — e.g. TPS5430 `,
      codeLink("C9864"), " (Basic, 3 A) or TPS54560B ", codeLink("C1850354"), " (Extended, 5 A).") : null;

    /* main solver region */
    let solverRegion;
    if (vt <= reg.minV) {
      solverRegion = h("div", { class: "panel empty" },
        `This part can't regulate below its ${fmtV(reg.vref)} reference${reg.shunt ? "" : " (plus headroom)"}. Enter a target above ${fmtV(reg.minV)}.`);
    } else if (!s) {
      solverRegion = h("div", { class: "panel empty" }, "No solutions in range — widen the close-enough band or check the target.");
    } else {
      solverRegion = frag(this.hero(R), this.solutionsTable(R));
    }

    return h("main", { class: "results" }, detail, overBanner, solverRegion, this.support(R));
  }

  hero(R) {
    const { reg, vt, s, wc, vtol } = R, S = this.state;
    const eqRes = h("span", { class: "eqres" }, " = ",
      h("b", { class: Math.abs(s.err) <= S.okPct ? "ok" : "bad" }, (reg.negative ? "−" : "") + fmtV(s.v)));
    return h("section", { class: "panel hero" },
      h("div", { class: "eq generic" },
        frag("V", sub("OUT"), " = " + (reg.negative ? "−" : ""), "V", sub("REF"), " · ( 1 + "), fracEl(reg.raName, reg.rbName), " )",
        reg.hasIadj ? frag(" + I", sub(reg.shunt ? "REF" : "ADJ"), " · " + reg.raName) : null),
      h("div", { class: "eq subst" },
        (reg.negative ? "−" : "") + reg.vref + " V · ( 1 + ", fracEl(fmtOhm(s.raOhms), fmtOhm(s.rb.ohms)), " )",
        reg.hasIadj ? ` + ${(reg.iadjTyp * 1e6).toFixed(0)} µA · ${fmtOhm(s.raOhms)}` : null, eqRes),
      h("div", { class: "wcline" },
        `target ${reg.negative ? "−" : ""}${fmtV(vt, 2)} · error ${s.err >= 0 ? "+" : ""}${s.err.toFixed(2)} % · with ${S.tol} % resistors & ${vtol} % `,
        "V", sub("REF"), ": ",
        h("b", {}, `${reg.negative ? "−" : ""}${fmtV(wc[0])} … ${reg.negative ? "−" : ""}${fmtV(wc[1])}`),
        reg.hasIadj && !reg.shunt ? h("span", { class: "dim" }, frag(" (upper bound includes I", sub("ADJ"), ` max ${(reg.iadjMax * 1e6).toFixed(0)} µA)`)) : null),
      this.schematic(R),
      h("div", { class: "dim schemcap" },
        `${reg.raName}: ${reg.raPath} · ${reg.rbName}: ${reg.rbPath} · divider current ≈ ${(reg.vref / s.rb.ohms * 1000).toFixed(2)} mA`)
    );
  }

  schematic(R) {
    const { reg } = R;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 560 96");
    svg.setAttribute("class", "schem");
    svg.setAttribute("aria-hidden", "true");
    const g1 = document.createElementNS(NS, "g");
    g1.setAttribute("stroke", "currentColor"); g1.setAttribute("stroke-width", "1.4"); g1.setAttribute("fill", "none");
    const lines = [[20,48,130,48],[206,48,300,48],[376,48,470,48],[253,48,253,20],[470,48,470,66],[458,66,482,66],[462,72,478,72],[466,78,474,78]];
    for (const [x1,y1,x2,y2] of lines) { const l = document.createElementNS(NS,"line"); l.setAttribute("x1",x1);l.setAttribute("y1",y1);l.setAttribute("x2",x2);l.setAttribute("y2",y2); g1.append(l); }
    for (const [x,y,w] of [[130,34,76],[300,34,76]]) { const r=document.createElementNS(NS,"rect"); r.setAttribute("x",x);r.setAttribute("y",y);r.setAttribute("width",w);r.setAttribute("height",28); g1.append(r); }
    svg.append(g1);
    const g2 = document.createElementNS(NS, "g"); g2.setAttribute("class", "schemtxt");
    const txt = (x, y, str, anchor) => { const t=document.createElementNS(NS,"text"); t.setAttribute("x",x);t.setAttribute("y",y); if(anchor)t.setAttribute("text-anchor",anchor); t.textContent=str; g2.append(t); };
    txt(20, 40, reg.shunt ? "VOUT (K)" : "VOUT");
    txt(168, 52, reg.rbPath.startsWith("VOUT") ? reg.rbName : reg.raName, "middle");
    txt(338, 52, reg.rbPath.startsWith("VOUT") ? reg.raName : reg.rbName, "middle");
    txt(253, 14, reg.shunt ? "REF" : reg.raPath.includes("ADJ") ? "ADJ" : "FB", "middle");
    txt(446, 40, "GND");
    svg.append(g2);
    return svg;
  }

  solutionsTable(R) {
    const { reg, sols, vtol } = R, S = this.state;
    return h("section", { class: "panel" },
      h("div", { class: "ptitle" }, "Solutions ",
        h("span", { class: "dim" }, `— top ${sols.length}, JLCPCB Basic 1 % resistors, ranked by error`)),
      h("table", {},
        h("thead", {}, h("tr", {},
          h("th", {}, reg.raName), h("th", {}, reg.rbName), h("th", {}, frag("V", sub("OUT"))),
          h("th", {}, "err"), h("th", {}, `worst case (${S.tol} %)`), h("th", {}, `±${S.okPct} %?`))),
        h("tbody", {}, ...sols.map((x, i) => {
          const w = worstCase(reg, x.raOhms, x.rb.ohms, S.tol, vtol);
          const pass = Math.abs(x.err) <= S.okPct;
          return h("tr", { class: i === S.sel ? "selrow" : "", onclick: () => this.set({ sel: i }) },
            h("td", {}, h("span", { class: "rv" }, partsStr(x)),
              x.mode !== "single" ? h("span", { class: "pairtag" }, x.mode === "series" ? "series" : "parallel") : null,
              h("div", { class: "codes" }, ...x.raParts.map((p) => codeLink(rbCode(p))))),
            h("td", {}, h("span", { class: "rv" }, x.rb.label), h("div", { class: "codes" }, codeLink(rbCode(x.rb)))),
            h("td", { class: "num" }, fmtV(x.v)),
            h("td", { class: "num " + (pass ? "ok" : "bad") }, `${x.err >= 0 ? "+" : ""}${x.err.toFixed(2)} %`),
            h("td", { class: "num dim" }, `${fmtV(w[0])} … ${fmtV(w[1])}`),
            h("td", {}, pass ? h("span", { class: "chip pass" }, "fits") : h("span", { class: "chip fail" }, "outside")));
        })),
      ),
      h("div", { class: "dim tnote" }, "LCSC codes are 0603 where stocked as Basic; click a code to open it. Click a row to load it into the formula.")
    );
  }

  support(R) {
    const { reg, vin, L } = R, D = this.data;
    const bom = h("ul", { class: "bom" },
      h("li", {}, h("span", { class: "role" }, "IC"),
        h("span", {}, reg.name, " ", h("span", { class: "dim" }, "· " + reg.pkgNote)),
        h("span", { class: "bomcode" }, reg.lcsc ? codeLink(reg.lcsc) : searchLink(reg.name.split(" ")[0], "search JLC"), " ", tierChip(reg.tier))),
      ...reg.support.map((p) => h("li", {},
        h("span", { class: "role" }, p.role),
        h("span", {}, p.d, p.note ? h("span", { class: "dim" }, " · " + p.note) : null),
        h("span", { class: "bomcode" }, p.c ? codeLink(p.c) : h("span", { class: "dim" }, "pick/search")))),
      L ? h("li", {}, h("span", { class: "role" }, "L"),
        h("span", {}, `≈ ${L.pick} µH, I`, sub("sat"), ` > ${L.ipk.toFixed(1)} A `,
          h("span", { class: "dim" }, frag("· from V", sub("IN"), ` ${vin} V, ${(reg.fsw / 1e3).toFixed(0)} kHz${reg.fswNote ? ` (${reg.fswNote})` : ""}, 30 % ripple`))),
        h("span", { class: "bomcode" }, searchLink(`${L.pick}uH power inductor`, "search JLC"), " ", h("span", { class: "tier ext" }, "Extended"))) : null,
      (reg.diode && !reg.support.some((p) => p.role.startsWith("D")))
        ? h("li", {}, h("span", { class: "role" }, "D"), h("span", {}, "Schottky catch diode"), h("span", { class: "bomcode" }, codeLink(D.support.ss34.c))) : null
    );

    return h("section", { class: "panel" },
      h("div", { class: "ptitle" }, "Around the regulator ", h("span", { class: "dim" }, "— Basic-part picks")),
      bom,
      reg.variants ? h("div", { class: "dim", style: "margin:4px 0" }, "Variants: ",
        ...reg.variants.map((v, i) => h("span", {}, i > 0 ? " · " : "", v.n + " ",
          v.c ? codeLink(v.c) : searchLink(v.n.split(" ")[0]), v.note ? ` (${v.note})` : ""))) : null,
      (reg.notes && reg.notes.length) ? h("ul", { class: "notes" }, ...reg.notes.map((n) => h("li", {}, n))) : null,
      (reg.boost && vin >= R.vt && R.vt > 0) ? h("div", { class: "warn" }, frag("Boost topology needs V", sub("IN"), " below V", sub("OUT"), " — currently it isn't.")) : null
    );
  }
}

customElements.define("regulator-solver", RegulatorSolver);
