// The locale of the site comes from the URL: `/uk/about` → `uk`, `/about` →
// the default (null). Edit Mode sets the locale itself, so admin routes are
// left alone. An unknown, disabled or default prefix is checked in the layout,
// once the languages are loaded.
export default defineNuxtRouteMiddleware((to) => {
  if (to.path.startsWith('/admin')) {
    return
  }

  const param = to.params.locale
  useCmsLocale().value = typeof param === 'string' && param ? param : null
})
