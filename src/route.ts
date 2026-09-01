/**
 * ============================================================================
 * ROUTES — the one part of the app that has a URL
 * ============================================================================
 * Almost nothing here is addressable, deliberately: view, selected ◇ and sheet position are all
 * transient, and the design lives in localStorage and leaves as a file (persist.ts). The build guide
 * is the exception, being the one DOCUMENT here.
 *
 * **The base path is read from the entry URL, not `import.meta.env.BASE_URL`**, because
 * vite.config's deliberate `base: "./"` (a position-independent build) leaves the bundle not knowing
 * where it is mounted. It looks once at the path it loaded from: everything up to the last `/` is
 * the mount, the segment after it a known route or nothing — a normal visit and the 404 fallback
 * (`spa-404`) yield the same base.
 *
 * Routes are therefore ONE SEGMENT deep and must stay so: relative asset URLs resolve against the
 * DIRECTORY of the current path, so a second segment looks one level too deep for `./assets/x.js`
 * and the page does not boot at all.
 * ============================================================================
 */

/** Every addressable page. One segment each — see the note above about relative asset URLs. */
export const ROUTES = ["guide"] as const;
export type PageRoute = (typeof ROUTES)[number] | null;

const isRoute = (s: string): s is NonNullable<PageRoute> => (ROUTES as readonly string[]).includes(s);

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

/** Which page the current URL names, or null for the app itself. Unknown segments read as null. */
export function currentRoute(): PageRoute {
  const seg = cleanPath().slice(BASE.length);
  return isRoute(seg) ? seg : null;
}

/** The href for a page, for pushState and for an `<a>` that should be a real link. */
export const routeHref = (r: PageRoute) => BASE + (r ?? "");
