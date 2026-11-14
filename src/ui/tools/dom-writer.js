/**
 * Change-only DOM writes for per-frame updates. Remembers the last value written
 * per node and skips the write when nothing changed. Every write to a node that
 * goes through a writer must keep going through it, or the cache goes stale.
 */
export function createDomWriter() {
  const texts = new WeakMap();
  const attrs = new WeakMap();
  const classes = new WeakMap();

  function record(map, el) {
    let rec = map.get(el);
    if (!rec) {
      rec = new Map();
      map.set(el, rec);
    }
    return rec;
  }

  return {
    /** Set textContent when it differs from the last value written. */
    text(el, value) {
      if (!el) return;
      const next = value == null ? '' : String(value);
      if (texts.get(el) === next) return;
      texts.set(el, next);
      el.textContent = next;
    },
    /** Set (or remove, for null) an attribute when it differs from the last value written. */
    attr(el, name, value) {
      if (!el) return;
      const rec = record(attrs, el);
      const next = value == null ? null : String(value);
      if (rec.has(name) && rec.get(name) === next) return;
      rec.set(name, next);
      if (next == null) el.removeAttribute(name);
      else el.setAttribute(name, next);
    },
    /** Toggle a class when its state differs from the last state written. */
    cls(el, name, on) {
      if (!el) return;
      const rec = record(classes, el);
      const next = !!on;
      if (rec.get(name) === next) return;
      rec.set(name, next);
      el.classList.toggle(name, next);
    },
  };
}
