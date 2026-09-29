import { isRoute, type PageRoute } from "./routes.ts";

export { ROUTES, type PageRoute } from "./routes.ts";

/** The pathname with a trailing `index.html` dropped — a file:// or hand-typed URL may carry one. */
const cleanPath = () => window.location.pathname.replace(/index\.html$/, "");

/**
 * Where this copy of the app is mounted, always ending in `/`. Read ONCE at load: pushState only
 * writes `BASE + slug`, so nothing afterwards can move it.
 */
export const BASE = (() => {
  const p = cleanPath();
  return p.slice(0, p.lastIndexOf("/") + 1);
})();

/** Which page the current URL names, or null for the app itself. */
export function currentRoute(): PageRoute {
  const seg = cleanPath().slice(BASE.length);
  return isRoute(seg) ? seg : null;
}

/** The href for a page, for pushState and for an `<a>` that should be a real link. */
export const routeHref = (r: PageRoute, hash = "") => BASE + (r ?? "") + hash;
