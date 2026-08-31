/**
 * ============================================================================
 * ROUTES — the one part of the app that has a URL
 * ============================================================================
 * Almost nothing here is addressable, and that is deliberate: which view you are in, which ◇ is
 * selected, how far the sheet is pulled up are all transient, and a URL for any of them would be a
 * link that means something different tomorrow. The design itself is not in the URL either — it is
 * held in localStorage and exported as a file (see persist.ts), because a silhouette is a dozen
 * floats and a query string is not where anybody wants their work kept.
 *
 * The build guide is the exception, because it is the one thing here that is a DOCUMENT. It is
 * worth linking to from a README, a message, or a printed page's own footer, and it is worth being
 * able to come back to with the browser's own back button. So it gets `/guide` and nothing else
 * does.
 *
 * **The base path is read from the entry URL, not from `import.meta.env.BASE_URL`.** vite.config
 * sets `base: "./"` on purpose — the build is position-independent, so the same artifact works at a
 * user site's root and under `/tomoshibi/` with no rebuild — and the cost of that is that the
 * bundle genuinely does not know where it is mounted. It can find out by looking, once, at the
 * path it was loaded from: everything up to the last `/` is the mount point, and the segment after
 * it is either a route this app knows or nothing at all. Both cases arrive here — `/tomoshibi/`
 * from a normal visit and `/tomoshibi/guide` from the 404 fallback (see the `spa-404` plugin in
 * vite.config.ts) — and both yield the same base.
 *
 * That is also why the routes are one segment deep and must stay that way. Relative asset URLs
 * resolve against the DIRECTORY of the current path, so `/tomoshibi/guide` loads `./assets/x.js`
 * as `/tomoshibi/assets/x.js` and works; `/tomoshibi/guide/print` would look for it one level too
 * deep and the page would not boot at all.
 * ============================================================================
 */

/** Every addressable page. One segment each — see the note above about relative asset URLs. */
export const ROUTES = ["guide"] as const;
export type PageRoute = (typeof ROUTES)[number] | null;

const isRoute = (s: string): s is NonNullable<PageRoute> => (ROUTES as readonly string[]).includes(s);

/** The pathname with a trailing `index.html` dropped — a file:// or hand-typed URL may carry one. */
const cleanPath = () => window.location.pathname.replace(/index\.html$/, "");

/**
 * Where this copy of the app is mounted, always ending in `/`. Read ONCE, at load: pushState only
 * ever writes `BASE + slug`, so nothing that happens afterwards can move it.
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
