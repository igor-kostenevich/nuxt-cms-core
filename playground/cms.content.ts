import { defineCmsContent } from 'nuxt-cms-core/config'

// Content of the playground (014). Core knows none of these names: pages and
// types are the Client Project's. The blog is a type with a route (Pages,
// Edit Mode); vacancies have no page of their own (Content, a dialog with the
// form declared below), listed on /careers; testimonials too.
export default defineCmsContent({
  pages: {
    home: { label: { en: 'Home', uk: 'Головна' }, path: '/' },
    about: { label: { en: 'About', uk: 'Про нас' }, path: '/about' },
    services: { label: { en: 'Services', uk: 'Послуги' }, path: '/services' },
    work: { label: { en: 'Work', uk: 'Проєкти' }, path: '/work' },
    careers: { label: { en: 'Careers', uk: 'Кар’єра' }, path: '/careers' },
    contact: { label: { en: 'Contact', uk: 'Контакти' }, path: '/contact' },
  },
  types: {
    post: {
      label: { en: 'Blog posts', uk: 'Статті' },
      route: '/blog/[slug]',
      order: 'newest',
      text: {
        newButton: { en: 'Write a post', uk: 'Написати статтю' },
        newTitle: { en: 'New post', uk: 'Нова стаття' },
      },
    },
    // Case studies: pages of their own under /work, edited in Edit Mode.
    project: {
      label: { en: 'Case studies', uk: 'Проєкти' },
      route: '/work/[slug]',
      order: 'newest',
      text: {
        newButton: { en: 'Add case study', uk: 'Додати проєкт' },
        newTitle: { en: 'New case study', uk: 'Новий проєкт' },
      },
    },
    // Vacancies: the form is declared here and Core renders it (C-103), with
    // every kind of field and width.
    vacancy: {
      label: { en: 'Vacancies', uk: 'Вакансії' },
      order: 'manual',
      text: {
        newButton: { en: 'Add vacancy', uk: 'Додати вакансію' },
        newTitle: { en: 'New vacancy', uk: 'Нова вакансія' },
        editTitle: { en: 'Edit vacancy — {title}', uk: 'Вакансія «{title}»' },
      },
      fields: {
        title: { type: 'text', label: { en: 'Position', uk: 'Посада' }, required: true, maxLength: 120 },
        location: { type: 'text', label: { en: 'City', uk: 'Місто' }, maxLength: 60, width: 'half' },
        employment: {
          type: 'select',
          label: { en: 'Employment', uk: 'Зайнятість' },
          width: 'half',
          default: 'full',
          options: [
            { value: 'full', label: { en: 'Full time', uk: 'Повна зайнятість' } },
            { value: 'part', label: { en: 'Part time', uk: 'Часткова зайнятість' } },
            { value: 'contract', label: { en: 'Contract', uk: 'Контракт' } },
          ],
        },
        level: {
          type: 'radio',
          label: { en: 'Level', uk: 'Рівень' },
          options: [
            { value: 'junior', label: 'Junior' },
            { value: 'middle', label: 'Middle' },
            { value: 'senior', label: 'Senior' },
          ],
        },
        salary: {
          type: 'number',
          label: { en: 'Salary from, USD', uk: 'Зарплата від, USD' },
          hint: { en: 'Empty: not shown on the site.', uk: 'Порожньо — не показується на сайті.' },
          min: 0,
          max: 1000000,
          width: 'quarter',
        },
        remote: {
          type: 'boolean',
          label: { en: 'Remote work', uk: 'Віддалено' },
          default: false,
          width: 'quarter',
        },
        hot: {
          type: 'boolean',
          appearance: 'checkbox',
          label: { en: 'Urgent', uk: 'Терміново' },
          width: 'quarter',
        },
        startDate: {
          type: 'date',
          label: { en: 'Start', uk: 'Початок роботи' },
          width: 'quarter',
        },
        deadline: {
          type: 'datetime',
          label: { en: 'Applications until', uk: 'Приймаємо відгуки до' },
          width: 'half',
        },
        interviews: {
          type: 'dateRange',
          label: { en: 'Interview dates', uk: 'Дати співбесід' },
          width: 'half',
        },
        skills: {
          type: 'multiselect',
          label: { en: 'Skills', uk: 'Навички' },
          max: 5,
          options: [
            { value: 'vue', label: 'Vue' },
            { value: 'typescript', label: 'TypeScript' },
            { value: 'figma', label: 'Figma' },
            { value: 'sql', label: 'SQL' },
            { value: 'testing', label: { en: 'Testing', uk: 'Тестування' } },
          ],
        },
        summary: {
          type: 'textarea',
          label: { en: 'Short summary', uk: 'Короткий опис' },
          hint: { en: 'Shown on the card in the list.', uk: 'Показується на картці в списку.' },
          maxLength: 280,
          rows: 3,
        },
        description: { type: 'richText', label: { en: 'Description', uk: 'Опис' } },
        contactEmail: { type: 'email', label: { en: 'Contact email', uk: 'Email для звʼязку' }, width: 'half' },
        contactPhone: { type: 'phone', label: { en: 'Phone', uk: 'Телефон' }, width: 'half' },
        companyUrl: { type: 'url', label: { en: 'Company website', uk: 'Сайт компанії' }, placeholder: 'https://' },
        logo: { type: 'image', label: { en: 'Logo', uk: 'Логотип' } },
        apply: { type: 'link', label: { en: 'Apply link', uk: 'Посилання для відгуку' } },
      },
    },
    // Testimonials: a short form, also declared.
    testimonial: {
      label: { en: 'Testimonials', uk: 'Відгуки' },
      order: 'manual',
      text: {
        newButton: { en: 'Add testimonial', uk: 'Додати відгук' },
        newTitle: { en: 'New testimonial', uk: 'Новий відгук' },
      },
      fields: {
        title: { type: 'text', label: { en: 'Author', uk: 'Автор' }, required: true, maxLength: 80, width: 'half' },
        role: { type: 'text', label: { en: 'Role and company', uk: 'Посада й компанія' }, maxLength: 80, width: 'half' },
        quote: { type: 'textarea', label: { en: 'Quote', uk: 'Цитата' }, required: true, maxLength: 400, rows: 4 },
        photo: { type: 'image', label: { en: 'Photo', uk: 'Фото' } },
      },
    },
    // Team members: shown on /about.
    member: {
      label: { en: 'Team', uk: 'Команда' },
      order: 'manual',
      text: {
        newButton: { en: 'Add team member', uk: 'Додати людину' },
        newTitle: { en: 'New team member', uk: 'Нова людина в команді' },
      },
      fields: {
        title: { type: 'text', label: { en: 'Name', uk: 'Імʼя' }, required: true, maxLength: 80, width: 'half' },
        role: { type: 'text', label: { en: 'Role', uk: 'Посада' }, maxLength: 80, width: 'half' },
        bio: { type: 'textarea', label: { en: 'Short bio', uk: 'Коротко про себе' }, maxLength: 300, rows: 3 },
        photo: { type: 'image', label: { en: 'Photo', uk: 'Фото' }, width: 'half' },
        email: { type: 'email', label: 'Email', width: 'half' },
        linkedin: { type: 'url', label: 'LinkedIn', placeholder: 'https://' },
      },
    },
    // Questions and answers: shown on /services.
    faq: {
      label: { en: 'FAQ', uk: 'Питання й відповіді' },
      order: 'manual',
      text: {
        newButton: { en: 'Add question', uk: 'Додати питання' },
        newTitle: { en: 'New question', uk: 'Нове питання' },
      },
      fields: {
        title: { type: 'text', label: { en: 'Question', uk: 'Питання' }, required: true, maxLength: 160 },
        answer: { type: 'richText', label: { en: 'Answer', uk: 'Відповідь' } },
        topic: {
          type: 'select',
          label: { en: 'Topic', uk: 'Тема' },
          width: 'half',
          default: 'general',
          options: [
            { value: 'general', label: { en: 'General', uk: 'Загальне' } },
            { value: 'pricing', label: { en: 'Pricing', uk: 'Вартість' } },
            { value: 'process', label: { en: 'Process', uk: 'Процес' } },
          ],
        },
      },
    },
    // Clients: the logo strip on /services.
    client: {
      label: { en: 'Clients', uk: 'Клієнти' },
      order: 'title',
      text: {
        newButton: { en: 'Add client', uk: 'Додати клієнта' },
        newTitle: { en: 'New client', uk: 'Новий клієнт' },
      },
      fields: {
        title: { type: 'text', label: { en: 'Company', uk: 'Компанія' }, required: true, maxLength: 80, width: 'half' },
        industry: { type: 'text', label: { en: 'Industry', uk: 'Галузь' }, maxLength: 60, width: 'half' },
        website: { type: 'url', label: { en: 'Website', uk: 'Сайт' }, placeholder: 'https://' },
        logo: { type: 'image', label: { en: 'Logo', uk: 'Логотип' } },
        since: { type: 'number', label: { en: 'Client since', uk: 'Клієнт з' }, min: 2000, max: 2100, width: 'quarter' },
      },
    },
  },
})
