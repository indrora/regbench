/* Tiny DOM builder + focus-preservation helper shared by every component.
   No framework — custom elements rebuild their subtree from scratch on each
   update() via replaceChildren(), which is simple but destroys focus. */

export const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "for") el.htmlFor = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};

export const frag = (...kids) => {
  const f = document.createDocumentFragment();
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    f.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return f;
};

/* Rebuilding a subtree wholesale (replaceChildren) drops focus and selection
   on whatever input was mid-edit. Tag the input with data-focus-key, wrap the
   rebuild in this, and it gets refocused (with selection restored) afterward
   if it's still present under the same key. */
export function withFocusPreserved(el, renderFn) {
  const active = document.activeElement;
  const key = active && el.contains(active) ? active.dataset.focusKey : null;
  const sel = key && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null;
  renderFn();
  if (key) {
    const next = el.querySelector(`[data-focus-key="${key}"]`);
    if (next) {
      next.focus();
      if (sel && next.setSelectionRange) { try { next.setSelectionRange(...sel); } catch { /* not a text-selectable input */ } }
    }
  }
}
