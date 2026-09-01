import { parseRVal } from "./format.js";

export function buildResistors(RDATA) {
  return Object.entries(RDATA)
    .map(([label, pkgs]) => ({ label, ohms: parseRVal(label), pkgs }))
    .filter((r) => r.ohms > 0)
    .sort((a, b) => a.ohms - b.ohms);
}

export function jellyFor(JELLY, n) {
  if (n.startsWith("LM2596")) return JELLY.lm2596;
  if (n.startsWith("LM2576")) return JELLY.lm2576;
  if (n.startsWith("XL1509") || n.startsWith("XXL1509")) return JELLY.xl1509;
  if (n.startsWith("TPS620")) return JELLY.tps620;
  if (n.startsWith("AMS1117")) return JELLY.ldo1117;
  if (n.startsWith("L78M")) return JELLY.ldo78m;
  return JELLY.ldoSmall;
}

/* ============================ fit / topology ============================ */
export function regFits(r, vt, vin, iout) {
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
export const topoTag = (r) =>
  /buck.?boost|buck \/ boost/i.test(r.topo) ? "buck-boost" :
  r.topo.startsWith("Linear") ? "LDO/linear" :
  r.topo.startsWith("Buck") ? "buck" :
  r.boost ? "boost" :
  r.topo.startsWith("Shunt") ? "shunt ref" : "other";

/* fixed-voltage (non-adjustable) parts fit differently: no divider, just
   current/power/Vin headroom against the part's own fixed rail. */
export function fixedFit(f, vin, iout) {
  const pdiss = f.t === "lin" ? Math.max(vin - f.v, 0) * iout : 0;
  const iok = iout <= f.i, pok = f.t !== "lin" || pdiss <= f.pd, vok = vin <= f.vim;
  return { ...f, pdiss, iok, pok, vok, ok: iok && pok && vok };
}
export const railMatch = (f, vt) => vt > 0 && Math.abs(f.v - vt) / vt < 0.01;

/* ============================ solver ============================ */
export const voutOf = (reg, ra, rb) => reg.vref * (1 + ra / rb) + (reg.iadjTyp || 0) * ra;

export function worstCase(reg, ra, rb, tolPct, vtolPct) {
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

export function solve(RESISTORS, reg, vt, allowPairs) {
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

export const LSTD = [1, 1.5, 2.2, 3.3, 4.7, 6.8, 10, 15, 22, 33, 47, 68, 100, 150, 220, 330];
export function suggestL(reg, vt, vin, iout) {
  if (!reg.fsw || reg.boost || reg.shunt || !vin || vin <= vt) return null;
  const dI = Math.max(0.3 * iout, 0.1);
  const L = (vt * (vin - vt)) / (vin * reg.fsw * dI) * 1e6;
  const pick = LSTD.reduce((b, x) => (Math.abs(x - L) < Math.abs(b - L) ? x : b), LSTD[0]);
  const ipk = iout + dI / 2;
  return { pick, ipk };
}

export const partsStr = (s) =>
  s.mode === "single" ? s.raParts[0].label :
  s.raParts.map((x) => x.label).join(s.mode === "series" ? " + " : " ∥ ");
export const rbCode = (r) => r.pkgs["0603"] || Object.values(r.pkgs)[0];
