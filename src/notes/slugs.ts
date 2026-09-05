/**
 * The note slugs, apart from the articles themselves.
 *
 * The router needs this list at load; importing it from `content.ts` would pull every article's
 * text through `route.ts` into the startup path. Each slug is ALSO a top-level route, so it is one
 * path segment and carries its own `note-` prefix rather than living under `notes/` — see
 * `ROUTES` in `../studio/route.ts`.
 */
export const NOTE_ROUTES = ["note-motivation"] as const;

export type NoteSlug = (typeof NOTE_ROUTES)[number];

export const isNoteSlug = (s: string): s is NoteSlug => (NOTE_ROUTES as readonly string[]).includes(s);
