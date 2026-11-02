import { cmsAuthGate } from '../auth/access'

/**
 * Named middleware for /admin pages. It is not global: a global
 * middleware would ship auth code on every public route.
 *
 * An existing site session without CMS access is sent home and is not signed out.
 * Signing out here would also sign the person out of the public site.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { ensure } = useCmsAuth()
  const snapshot = await ensure()

  const decision = cmsAuthGate(to.path, to.fullPath, snapshot)

  if (decision.action === 'login') {
    return navigateTo({
      path: '/admin/login',
      query: { redirect: decision.redirect },
    })
  }

  if (decision.action === 'home') {
    return navigateTo('/')
  }
})
