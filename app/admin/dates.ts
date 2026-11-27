/**
 * A date of the admin lists: "24.11.2026" (day, month, year as digits), the
 * same in every language of the admin; empty without one. The local date.
 */
export function adminDate(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}
