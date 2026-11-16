<script setup lang="ts">
definePageMeta({
  // The Client Project's layouts frame the site, not the admin.
  layout: false,
  middleware: ['cms-auth'],
})

const dismissed = ref(false)

const variants = ['primary', 'secondary', 'ghost', 'destructive', 'link'] as const
const sizes = [
  { id: 'sm', label: 'Small · 32 px' },
  { id: 'md', label: 'Medium · 36 px' },
  { id: 'lg', label: 'Large · 40 px' },
] as const
</script>

<template>
  <AdminRoot>
    <main class="kit">
      <header class="kit__header">
        <h1>Admin UI kit</h1>
        <p>Buttons, alerts and the login input. Hover, press and tab to see the live states.</p>
      </header>

      <section class="kit__section">
        <h2>Button variants</h2>
        <div class="kit__row">
          <AdminButton
            v-for="variant in variants"
            :key="variant"
            :variant="variant"
          >
            <template
              v-if="variant !== 'ghost' && variant !== 'link'"
              #leading
            >
              <Icon
                name="lucide:circle-check"
                aria-hidden="true"
              />
            </template>
            {{ variant }}
          </AdminButton>
          <AdminButton
            icon-only
            aria-label="More"
          >
            <template #leading>
              <Icon
                name="lucide:ellipsis"
                aria-hidden="true"
              />
            </template>
          </AdminButton>
        </div>
      </section>

      <section class="kit__section">
        <h2>Sizes and icon placement</h2>
        <div
          v-for="size in sizes"
          :key="size.id"
          class="kit__block"
        >
          <h3>{{ size.label }}</h3>
          <div class="kit__row">
            <AdminButton
              :size="size.id"
              variant="secondary"
            >
              Save
            </AdminButton>
            <AdminButton :size="size.id">
              <template #leading>
                <Icon
                  name="lucide:circle-check"
                  aria-hidden="true"
                />
              </template>
              Add
            </AdminButton>
            <AdminButton :size="size.id">
              Next
              <template #trailing>
                <Icon
                  name="lucide:chevron-right"
                  aria-hidden="true"
                />
              </template>
            </AdminButton>
            <AdminButton
              :size="size.id"
              icon-only
              variant="secondary"
              aria-label="More"
            >
              <template #leading>
                <Icon
                  name="lucide:ellipsis"
                  aria-hidden="true"
                />
              </template>
            </AdminButton>
          </div>
        </div>
      </section>

      <section class="kit__section">
        <h2>Disabled and loading</h2>
        <div class="kit__row">
          <AdminButton
            v-for="variant in variants"
            :key="`disabled-${variant}`"
            :variant="variant"
            disabled
          >
            {{ variant }}
          </AdminButton>
        </div>
        <div class="kit__row">
          <AdminButton
            v-for="variant in variants"
            :key="`loading-${variant}`"
            :variant="variant"
            loading
          >
            Saving
          </AdminButton>
        </div>
      </section>

      <section class="kit__section">
        <h2>Alerts</h2>
        <div class="kit__alerts">
          <AdminAlert
            tone="info"
            title="Information"
          >
            Analytics data can take up to 24 hours to appear.
          </AdminAlert>
          <AdminAlert
            v-if="!dismissed"
            tone="success"
            title="Changes published"
            dismissible
            @dismiss="dismissed = true"
          >
            The latest version is now visible on the website.
          </AdminAlert>
          <AdminAlert
            tone="warning"
            title="Review recommended"
          >
            Three pages are missing meta descriptions.
            <template #action>
              <AdminButton
                variant="link"
                size="sm"
              >
                Review details
                <template #trailing>
                  <Icon
                    name="lucide:chevron-right"
                    aria-hidden="true"
                  />
                </template>
              </AdminButton>
            </template>
          </AdminAlert>
          <AdminAlert
            tone="danger"
            title="Connection failed"
          >
            Check the API credentials and try again.
          </AdminAlert>
          <AdminAlert
            tone="info"
            title="Simple message"
          />
        </div>
      </section>

      <section class="kit__section">
        <h2>Login input</h2>
        <div class="kit__fields">
          <AdminInput
            label="Email"
            placeholder="name@company.com"
            type="email"
          >
            <template #leading>
              <Icon
                name="lucide:mail"
                aria-hidden="true"
              />
            </template>
          </AdminInput>
          <AdminInput
            label="Email with an error"
            placeholder="name@company.com"
            type="email"
            error="Enter an email address."
          >
            <template #leading>
              <Icon
                name="lucide:mail"
                aria-hidden="true"
              />
            </template>
          </AdminInput>
          <AdminInput
            label="Disabled"
            placeholder="Unavailable"
            disabled
          >
            <template #leading>
              <Icon
                name="lucide:lock"
                aria-hidden="true"
              />
            </template>
          </AdminInput>
        </div>
      </section>
    </main>
  </AdminRoot>
</template>

<style scoped>
.kit {
  width: min(100%, 960px);
  margin: 0 auto;
  padding: var(--cms-space-8) var(--cms-space-4) var(--cms-space-16);
}

.kit__header h1,
.kit__section h2,
.kit__block h3,
.kit__header p {
  margin: 0;
}

.kit__header h1 {
  font-size: var(--cms-type-display-size);
  font-weight: var(--cms-type-display-weight);
  line-height: var(--cms-type-display-line);
}

.kit__header p {
  margin-top: var(--cms-space-2);
  color: var(--cms-text-secondary);
}

.kit__section {
  margin-top: var(--cms-space-8);
}

.kit__section h2,
.kit__block h3 {
  margin-bottom: var(--cms-space-4);
  font-size: var(--cms-type-h3-size);
  font-weight: var(--cms-type-h3-weight);
  line-height: var(--cms-type-h3-line);
}

.kit__block + .kit__block {
  margin-top: var(--cms-space-5);
}

.kit__row,
.kit__alerts,
.kit__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-3);
}

.kit__alerts,
.kit__fields {
  flex-direction: column;
  align-items: stretch;
  max-width: 560px;
}
</style>
