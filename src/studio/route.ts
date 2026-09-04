import { NOTE_ROUTES, type NoteSlug } from "../notes/content.ts";

export const ROUTES = ["guide", "notes", ...NOTE_ROUTES] as const;
export type PageRoute = "guide" | "notes" | NoteSlug | null;

const isNoteRoute = (s: string): s is NoteSlug => (NOTE_ROUTES as readonly string[]).includes(s);

/** The pathname with a trailing `index.html` dropped — a file:// or hand-typed URL may carry one. */
const cleanPath = () => window.location.pathname.replace(/index\.html$/, "");

function pagePath(r: NonNullable<PageRoute>): string {
  return isNoteRoute(r) ? `notes/${r}` : r;
}

function pathRoute(path: string): PageRoute {
  if (path === "guide" || path === "notes") return path;
  if (path.startsWith("notes/")) {
    const slug = path.slice("notes/".length);
    return isNoteRoute(slug) ? slug : null;
  }
  return null;
}

function matchRoute(pathname: string): { base: string; route: PageRoute } | null {
  const paths = [...NOTE_ROUTES.map((r) => `notes/${r}`), "guide", "notes"];
  for (const path of paths) {
    if (!pathname.endsWith(path)) continue;
    const base = pathname.slice(0, pathname.length - path.length);
    if (base.endsWith("/")) return { base, route: pathRoute(path) };
  }
  return null;
}

/**
 * Where this copy of the app is mounted, always ending in `/`. Read ONCE at load: pushState writes
 * paths under it, and a note is nested under `notes/` while still sharing the same app base.
 */
export const BASE = (() => {
  const p = cleanPath();
  const match = matchRoute(p);
  if (match) return match.base;
  return p.slice(0, p.lastIndexOf("/") + 1);
})();

/** Which page the current URL names, or null for the app itself. */
export function currentRoute(): PageRoute {
  const seg = cleanPath().slice(BASE.length).replace(/^\/+/, "").replace(/\/$/, "");
  return pathRoute(seg);
}

/** The href for a page, for pushState and for an `<a>` that should be a real link. */
export const routeHref = (r: PageRoute, hash = "") => BASE + (r ? pagePath(r) : "") + hash;
