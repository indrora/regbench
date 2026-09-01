import { h } from "./dom.js";

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

export const codeLink = (c) => c
  ? h("a", { class: "code", href: partUrl(c), target: "_blank", rel: "noreferrer", title: "JLCPCB part detail (tier + stock)" }, c)
  : null;
export const searchLink = (q, label = "search", stop = false) =>
  h("a", { class: "code", href: jlcSearch(q), target: "_blank", rel: "noreferrer", onclick: stop ? (e) => e.stopPropagation() : null }, label);
export const tierChip = (t) =>
  t === "Basic" ? h("span", { class: "tier basic" }, "Basic") :
  t === "Extended" ? h("span", { class: "tier ext" }, "Extended") :
  h("span", { class: "tier unk" }, "code unverified");
export const fracEl = (top, bot) => h("span", { class: "frac" }, h("span", { class: "ft" }, top), h("span", { class: "fb" }, bot));
export const sub = (t) => h("sub", {}, t);
