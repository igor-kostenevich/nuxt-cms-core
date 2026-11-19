<script setup lang="ts">
// The contact form of the playground (011): markup and design are the site's,
// state, texts and sending come from useCmsForm.
const contact = useCmsForm('contact')
const { t } = useCmsText()
</script>

<template>
  <section
    class="contact-form"
    aria-labelledby="contact-form-title"
  >
    <h2 id="contact-form-title">
      {{ contact.text('title') }}
    </h2>

    <p
      v-if="contact.status.value === 'sent'"
      class="contact-form__done"
      role="status"
    >
      {{ contact.text('success') }}
    </p>

    <form
      v-else
      novalidate
      @submit.prevent="contact.submit()"
    >
      <div class="contact-form__field">
        <label for="cf-name">{{ contact.label('name') }}</label>
        <input
          id="cf-name"
          v-model="contact.values.name"
          type="text"
          autocomplete="name"
          :aria-invalid="contact.fieldError('name') ? 'true' : undefined"
        >
        <span
          v-if="contact.fieldError('name')"
          class="contact-form__error"
        >{{ contact.fieldError('name') }}</span>
      </div>

      <div class="contact-form__field">
        <label for="cf-email">{{ contact.label('email') }}</label>
        <input
          id="cf-email"
          v-model="contact.values.email"
          type="email"
          autocomplete="email"
          :aria-invalid="contact.fieldError('email') ? 'true' : undefined"
        >
        <span
          v-if="contact.fieldError('email')"
          class="contact-form__error"
        >{{ contact.fieldError('email') }}</span>
      </div>

      <div class="contact-form__field">
        <label for="cf-phone">{{ contact.label('phone') }}</label>
        <input
          id="cf-phone"
          v-model="contact.values.phone"
          type="tel"
          autocomplete="tel"
        >
        <span
          v-if="contact.fieldError('phone')"
          class="contact-form__error"
        >{{ contact.fieldError('phone') }}</span>
      </div>

      <div class="contact-form__field">
        <label for="cf-service">{{ contact.label('service') }}</label>
        <select
          id="cf-service"
          v-model="contact.values.service"
        >
          <option value="">
            {{ contact.text('service.empty') }}
          </option>
          <option
            v-for="value in contact.form?.fields.find(field => field.key === 'service')?.options ?? []"
            :key="value"
            :value="value"
          >
            {{ contact.option('service', value) }}
          </option>
        </select>
      </div>

      <div class="contact-form__field">
        <label for="cf-message">{{ contact.label('message') }}</label>
        <textarea
          id="cf-message"
          v-model="contact.values.message"
          rows="5"
          :aria-invalid="contact.fieldError('message') ? 'true' : undefined"
        />
        <span
          v-if="contact.fieldError('message')"
          class="contact-form__error"
        >{{ contact.fieldError('message') }}</span>
      </div>

      <label class="contact-form__check">
        <input
          v-model="contact.values.consent"
          type="checkbox"
        >
        {{ contact.label('consent') }}
      </label>
      <span
        v-if="contact.fieldError('consent')"
        class="contact-form__error"
      >{{ contact.fieldError('consent') }}</span>

      <input
        v-model="contact.honeypot.value"
        v-bind="contact.honeypotAttrs"
      >

      <p
        v-if="contact.fieldError('_form')"
        class="contact-form__error"
        role="alert"
      >
        {{ contact.fieldError('_form') }}
      </p>
      <p
        v-else-if="contact.problem.value"
        class="contact-form__error"
        role="alert"
      >
        {{ t(`forms.problems.${contact.problem.value}`) }}
      </p>

      <button
        type="submit"
        :disabled="contact.status.value === 'sending'"
      >
        {{ contact.status.value === 'sending' ? contact.text('sending') : contact.text('submit') }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.contact-form {
  max-width: 560px;
  margin-top: 64px;
}

.contact-form form {
  display: grid;
  gap: 16px;
}

.contact-form__field {
  display: grid;
  gap: 6px;
}

.contact-form input:not([type="checkbox"]),
.contact-form select,
.contact-form textarea {
  padding: 10px 12px;
  border: 1px solid #c9c9c9;
  border-radius: 8px;
  font: inherit;
}

.contact-form [aria-invalid="true"] {
  border-color: #b42318;
}

.contact-form__check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.contact-form__error {
  color: #b42318;
  font-size: 14px;
}

.contact-form__done {
  padding: 16px;
  border-radius: 8px;
  background: #ecfdf3;
}

.contact-form button {
  justify-self: start;
  padding: 10px 20px;
  border: 0;
  border-radius: 8px;
  background: #111;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
</style>
