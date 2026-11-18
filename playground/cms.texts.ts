import { defineCmsTexts } from 'nuxt-cms-core/config'

// Site texts of the playground (MASTER_PLAN C-85): texts that are not on any
// CMS page. Written here in the default language; owners and admins change
// and translate them in the admin (Texts) without a deploy.
export default defineCmsTexts({
  'nav.home': { text: 'Home', context: 'Menu item' },
  'nav.about': { text: 'About', context: 'Menu item' },
  'nav.services': { text: 'Services', context: 'Menu item' },
  'nav.work': { text: 'Work', context: 'Menu item' },
  'nav.contact': { text: 'Contact', context: 'Menu item' },
  'header.cta': { text: 'Get in touch', context: 'Button at the right of the header' },
  'header.skip': { text: 'Skip to content', context: 'Link for keyboard users, visible on focus' },
  'footer.copyright': { text: '© {year} Luminary Studio', context: 'Footer; {year} is the current year' },
  'footer.about': { text: 'About', context: 'Footer link' },
  'meta.homeTitle': { text: 'Luminary — creative studio', context: 'Browser tab title of the home page' },
  'meta.aboutTitle': { text: 'About — Luminary', context: 'Browser tab title of the About page' },
})
