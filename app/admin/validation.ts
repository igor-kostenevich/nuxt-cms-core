export type FieldRule = (value: unknown) => true | string

/**
 * Matches `minimum_password_length` in supabase/config.toml.
 * Auth rejects anything shorter, so the form should too.
 */
export const PASSWORD_MIN_LENGTH = 6
