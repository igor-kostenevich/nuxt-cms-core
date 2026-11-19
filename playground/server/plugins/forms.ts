// A business rule of the site, after the built-in checks of Core (011):
// a message with many links is refused as spam-like.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cms:forms:validate', ({ form, values, errors }) => {
    const message = typeof values.message === 'string' ? values.message : ''

    if (form.key === 'contact' && (message.match(/https?:\/\//g) ?? []).length > 2) {
      errors.push({ field: 'message', code: 'too_many_links' })
    }
  })
})
