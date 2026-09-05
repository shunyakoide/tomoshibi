import { NOTE_ROUTES } from "../notes/slugs.ts";

/** Every addressable page. ONE segment each, and that is load-bearing — see `BASE` below. */
export const ROUTES = ["guide", "notes", ...NOTE_ROUTES] as const;
export type PageRoute = (typeof ROUTES)[number] | null;

/** A route with a `/` in it becomes `never`, and `PATHS` below stops compiling. */
type Segment<S extends string> = S extends `${string}/${string}` ? never : S;

/** `ROUTES` with the one-segment rule applied by the compiler. `isRoute` matches against THIS, so
 *  the check cannot quietly be dropped as an unused declaration. */
const PATHS: readonly Segment<NonNullable<PageRoute>>[] = ROUTES;

const isRoute = (s: string): s is NonNullable<PageRoute> => (PATHS as readonly string[]).includes(s);

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
