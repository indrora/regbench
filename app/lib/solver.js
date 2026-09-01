import { parseRVal } from "./format.js";

/* families{} -> a flat list of variants, each tagged with its family id/name.
   Used anywhere that needs to look a variant up by id or walk every variant
   without caring about family grouping (part-picker's fit-filtering,
   regulator-solver's "find the selected variant" lookup). */
export function allVariants(families) {
  const out = [];
  for (const [familyId, fam] of Object.entries(families)) {
    for (const v of fam.variants) out.push({ ...v, familyId, familyName: fam.name });
  }
  return out;
}

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
/* Adjustable variants (kind "adjustable") -- set by a resistor divider off
   referenceVoltage. Variants discovered from db.sqlite3 text-scraping
   (needsReview: true) usually lack referenceVoltage/bottomResistorRange
   entirely, since those can't be reliably parsed from a JLCPCB description --
   treat them as never "fitting" the divider solver rather than crashing. */
export function adjustableFits(v, vt, vin, iout) {
  if (v.referenceVoltage == null || !v.bottomResistorRange || !v.topology) return false;
  if (vt <= v.vOutMin) return false;
  const lim = v.limits || "";
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
  const canStepUp = v.isBoost || /boost|invert|buck.?boost/i.test(v.topology);
  const canStepDown = !v.isBoost && (/buck|linear|ldo|invert/i.test(v.topology));
  const eq = Math.abs(vin - vt) < 0.3;
  if (eq) { if (!(/buck.?boost|buck \/ boost|invert/i.test(v.topology))) return false; }
  else if (vin < vt) { if (!canStepUp) return false; }
  else { if (!canStepDown) return false; }
  if (vin > vt) {
    if (v.topology.startsWith("Buck") && vin < vt + 1.2) return false;
    if (v.topology.startsWith("Linear") && (vin < vt + 1.5 || (vin - vt) * iout > 5)) return false;
  }
  return true;
}
export const topoTag = (v) => {
  const topology = v.topology || "";
  return /buck.?boost|buck \/ boost/i.test(topology) ? "buck-boost" :
    topology.startsWith("Linear") ? "LDO/linear" :
    topology.startsWith("Buck") ? "buck" :
    v.isBoost ? "boost" :
    topology.startsWith("Shunt") ? "shunt ref" : v.needsReview ? "unverified" : "other";
};

/* fixed-voltage (non-adjustable) variants fit differently: no divider, just
   current/power/Vin headroom against the part's own fixed rail. */
export function fixedFits(v, vin, iout) {
  const pdiss = v.converterType === "linear" ? Math.max(vin - v.vOutFixed, 0) * iout : 0;
  const iok = iout <= v.iOutMax, pok = v.converterType !== "linear" || pdiss <= v.powerDissipationMax, vok = vin <= v.vInMax;
  return { ...v, pdiss, iok, pok, vok, ok: iok && pok && vok };
}
export const railMatch = (v, vt) => vt > 0 && Math.abs(v.vOutFixed - vt) / vt < 0.01;

/* dispatcher used by part-picker.js so it doesn't need to branch on kind
   itself when just filtering the family/variant list down to "fits". */
export const variantFits = (v, vt, vin, iout) =>
  v.kind === "fixed" ? railMatch(v, vt) && fixedFits(v, vin, iout).ok : adjustableFits(v, vt, vin, iout);

/* ============================ solver ============================ */
export const voutOf = (reg, ra, rb) => reg.referenceVoltage * (1 + ra / rb) + (reg.adjustCurrentTypical || 0) * ra;

export function worstCase(reg, ra, rb, tolPct, vtolPct) {
  const t = tolPct / 100, v = vtolPct / 100;
  const hi = reg.referenceVoltage * (1 + v) * (1 + (ra * (1 + t)) / (rb * (1 - t))) + (reg.adjustCurrentMax || 0) * ra * (1 + t);
  const lo = reg.referenceVoltage * (1 - v) * (1 + (ra * (1 - t)) / (rb * (1 + t)));
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
  const inRange = RESISTORS.filter((r) => r.ohms >= reg.bottomResistorRange[0] && r.ohms <= reg.bottomResistorRange[1]);
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
      const need = (vt - reg.referenceVoltage) / (reg.referenceVoltage / rb.ohms + (reg.adjustCurrentTypical || 0));
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
  if (!reg.switchingFreqHz || reg.isBoost || reg.isShunt || !vin || vin <= vt) return null;
  const dI = Math.max(0.3 * iout, 0.1);
  const L = (vt * (vin - vt)) / (vin * reg.switchingFreqHz * dI) * 1e6;
  const pick = LSTD.reduce((b, x) => (Math.abs(x - L) < Math.abs(b - L) ? x : b), LSTD[0]);
  const ipk = iout + dI / 2;
  return { pick, ipk };
}

export const partsStr = (s) =>
  s.mode === "single" ? s.raParts[0].label :
  s.raParts.map((x) => x.label).join(s.mode === "series" ? " + " : " ∥ ");
export const rbCode = (r) => r.pkgs["0603"] || Object.values(r.pkgs)[0];
