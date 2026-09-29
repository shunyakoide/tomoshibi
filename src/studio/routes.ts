import { NOTE_ROUTES } from "../notes/slugs.ts";

/**
 * Every addressable page. ONE segment each, and that is load-bearing — see `BASE` in `route.ts`.
 *
 * Its own module, with no `window` in it, because `vite.config.ts` reads it too: the inline
 * trailing-slash redirect in index.html is generated from this list (see `trailingSlash()` there).
 */
export const ROUTES = ["guide", "notes", ...NOTE_ROUTES] as const;
export type PageRoute = (typeof ROUTES)[number] | null;

/** A route with a `/` in it becomes `never`, and `PATHS` below stops compiling. */
type Segment<S extends string> = S extends `${string}/${string}` ? never : S;

/** `ROUTES` with the one-segment rule applied by the compiler. `isRoute` matches against THIS, so
 *  the check cannot quietly be dropped as an unused declaration. */
const PATHS: readonly Segment<NonNullable<PageRoute>>[] = ROUTES;

export const isRoute = (s: string): s is NonNullable<PageRoute> => (PATHS as readonly string[]).includes(s);
