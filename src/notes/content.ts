import type { Lang } from "../i18n.ts";
import { isNoteSlug, NOTE_ROUTES, type NoteSlug } from "./slugs.ts";
import jaMotivation from "./articles/ja/motivation.md?raw";
import enMotivation from "./articles/en/motivation.md?raw";

export type NoteMeta = {
  slug: NoteSlug;
  title: string;
  summary: string;
  category: string;
};

export type NoteDoc = NoteMeta & {
  body: string;
};

/** Both languages of every note. A Record over the slugs, so a slug with no article — or with only
 *  one language — is a compile error rather than an untitled card. */
const SOURCES: Record<NoteSlug, Record<Lang, string>> = {
  "note-motivation": { ja: jaMotivation, en: enMotivation },
};

export function listNotes(lang: Lang): NoteMeta[] {
  return NOTE_ROUTES.map((slug) => noteDoc(slug, lang));
}

export function getNote(slug: string, lang: Lang): NoteDoc | null {
  return isNoteSlug(slug) ? noteDoc(slug, lang) : null;
}

function noteDoc(slug: NoteSlug, lang: Lang): NoteDoc {
  return { slug, ...parseFrontmatter(SOURCES[slug][lang]) };
}

/** `---` … `---` of `key: value` lines, then the body. Line endings are normalised first: a CRLF
 *  checkout would otherwise miss the opening fence and print the frontmatter as prose. */
function parseFrontmatter(raw: string): Omit<NoteDoc, "slug"> {
  const src = raw.replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return { title: "", summary: "", category: "", body: src.trim() };
  const end = src.indexOf("\n---", 4);
  if (end < 0) return { title: "", summary: "", category: "", body: src.trim() };
  const head = src.slice(4, end).trim().split("\n");
  const meta: Record<string, string> = {};
  for (const line of head) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return {
    title: meta.title ?? "",
    summary: meta.summary ?? "",
    category: meta.category ?? "",
    body: src.slice(end + 5).trim(),
  };
}
