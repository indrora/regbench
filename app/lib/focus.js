/* Rebuilding a subtree wholesale (innerHTML reassignment) drops focus and
   selection on whatever input was mid-edit. Tag the input with
   data-focus-key, wrap the rebuild in this, and it gets refocused (with
   selection restored) afterward if it's still present under the same key. */
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
