// Tiny hash-based router. No dependencies.

const routes = {};

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) {
    rerender(); // already there — force a re-render anyway
  } else {
    window.location.hash = path;
  }
}

export function rerender() {
  const path = window.location.hash.slice(1) || '/';
  const segs = path.split('/').filter(Boolean);
  const root = segs.length ? `/${segs[0]}` : '/';
  const param = segs[1];
  const handler = routes[root] || routes['/'];
  handler(document.getElementById('app'), param);
}

export function start() {
  window.addEventListener('hashchange', rerender);
  rerender();
}
