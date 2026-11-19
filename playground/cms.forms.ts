import { defineCmsForms } from 'nuxt-cms-core/config'

// Forms of the playground (011). Structure and rules live here; texts
// (labels, options, messages) are site texts in cms.texts.ts.
export default defineCmsForms({
  contact: {
    fields: [
      { key: 'name', type: 'text', role: 'name', required: true, maxLength: 100 },
      { key: 'email', type: 'email', role: 'email', required: true },
      { key: 'phone', type: 'tel', role: 'phone' },
      { key: 'service', type: 'select', options: ['web', 'brand', 'seo'] },
      { key: 'message', type: 'textarea', role: 'message', required: true, maxLength: 3000 },
      { key: 'consent', type: 'checkbox', required: true },
    ],
  },
  // A form without a message: the inbox shows the email as who sent it.
  newsletter: {
    fields: [
      { key: 'email', type: 'email', role: 'email', required: true },
    ],
  },
})
