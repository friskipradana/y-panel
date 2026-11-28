// Talks to the page inside the sandboxed preview frame (no same origin): a small script reports the clicked element by message,
// and direct edits are applied to the page source itself, so what is saved never contains the script.

export const PICK_MESSAGE = 'reneo-studio:pick'
export const MODE_MESSAGE = 'reneo-studio:mode'

export interface PickedElement {
  /** child indexes from <body> down to the element */
  path: number[]
  tag: string
  selector: string
  html: string
  /** set only when the element holds nothing but text */
  text: string | null
  src: string | null
  href: string | null
}

const BRIDGE = `
(function () {
  var on = false, last = null;
  var mark = document.createElement('div');
  mark.setAttribute('data-reneo-bridge', '');
  mark.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid rgb(37,99,235);background:rgba(37,99,235,.12);display:none';
  document.documentElement.appendChild(mark);
  function paint(el) {
    if (!on || !el || el === document.body || el === document.documentElement) { mark.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    mark.style.display = 'block';
    mark.style.left = r.left + 'px'; mark.style.top = r.top + 'px';
    mark.style.width = r.width + 'px'; mark.style.height = r.height + 'px';
  }
  function pathOf(el) {
    var path = [], names = [];
    while (el && el !== document.body) {
      var p = el.parentElement;
      if (!p) return null;
      var i = Array.prototype.indexOf.call(p.children, el);
      path.unshift(i);
      names.unshift(el.tagName.toLowerCase() + ':nth-child(' + (i + 1) + ')');
      el = p;
    }
    return el ? { path: path, selector: 'body > ' + names.join(' > ') } : null;
  }
  addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || e.data.type !== '${MODE_MESSAGE}') return;
    on = !!e.data.on;
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    if (!on) mark.style.display = 'none';
  });
  document.addEventListener('mouseover', function (e) { if (on) { last = e.target; paint(last); } }, true);
  addEventListener('scroll', function () { paint(last); }, true);
  ['click', 'submit', 'mousedown'].forEach(function (name) {
    document.addEventListener(name, function (e) {
      if (!on) return;
      e.preventDefault(); e.stopPropagation();
      if (name !== 'click') return;
      var el = e.target.closest('svg') || e.target;
      if (el === document.body || el === document.documentElement) return;
      var where = pathOf(el);
      if (!where) return;
      last = el; paint(el);
      parent.postMessage({ type: '${PICK_MESSAGE}', element: {
        path: where.path, selector: where.selector, tag: el.tagName.toLowerCase(),
        html: el.outerHTML.slice(0, 4000),
        text: el.children.length === 0 && el.tagName !== 'IMG' ? el.textContent : null,
        src: el.tagName === 'IMG' ? el.getAttribute('src') : null,
        href: el.tagName === 'A' ? el.getAttribute('href') : null
      } }, '*');
    }, true);
  });
  parent.postMessage({ type: '${PICK_MESSAGE}', ready: true }, '*');
})();
`

export function withBridge(html: string): string {
  const tag = `<script data-reneo-bridge>${BRIDGE}</script>`
  const at = html.toLowerCase().lastIndexOf('</body>')
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag
}

export interface ElementEdit {
  text?: string
  src?: string
  href?: string
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

// Applies a change to the same element in the source. Returns null when the source does not hold that element as shown
// (a script built or changed it), so the caller can ask the AI instead of editing the wrong thing.
export function applyElementEdit(source: string, picked: PickedElement, edit: ElementEdit): string | null {
  const doc = new DOMParser().parseFromString(source, 'text/html')
  let el: Element | undefined = doc.body
  for (const index of picked.path) el = el?.children[index]
  if (!el || el.tagName.toLowerCase() !== picked.tag) return null
  if (picked.text !== null && norm(el.textContent) !== norm(picked.text)) return null
  if (picked.src !== null && el.getAttribute('src') !== picked.src) return null
  if (picked.href !== null && el.getAttribute('href') !== picked.href) return null
  if (edit.text !== undefined) {
    if (el.children.length > 0) return null
    el.textContent = edit.text
  }
  if (edit.src !== undefined) {
    el.setAttribute('src', edit.src)
    el.removeAttribute('srcset')
  }
  if (edit.href !== undefined) el.setAttribute('href', edit.href)
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
}
