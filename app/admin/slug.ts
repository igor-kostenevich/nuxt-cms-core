/**
 * An address suggested from a title (014 §6): Latin letters, digits and single
 * hyphens, at most 80 characters. Ukrainian and Russian letters are
 * transliterated (Ukrainian national system, simplified); other letters lose
 * their accents; anything else becomes a hyphen.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ъ: '', ы: 'y', э: 'e', ё: 'io', "'": '', '’': '',
}

export const SLUG_MAX = 80
export const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(title: string): string {
  const latin = [...title.toLowerCase()]
    .map(char => CYRILLIC[char] ?? char)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')

  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
}
