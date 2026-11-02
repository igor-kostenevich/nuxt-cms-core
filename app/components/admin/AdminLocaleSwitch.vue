<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()

const options = computed(() => {
  return locales.value.flatMap((item) => {
    if (typeof item === 'string') {
      return [{ code: item, name: item }]
    }

    return [{ code: item.code, name: item.name ?? item.code }]
  })
})

async function onChange(event: Event) {
  const target = event.target

  if (!(target instanceof HTMLSelectElement)) {
    return
  }

  const next = options.value.find((item) => item.code === target.value)

  if (!next) {
    return
  }

  await setLocale(next.code)
}
</script>

<template>
  <label>
    {{ t('admin.locale.label') }}
    <select
      :value="locale"
      @change="onChange"
    >
      <option
        v-for="item in options"
        :key="item.code"
        :value="item.code"
      >
        {{ item.name }}
      </option>
    </select>
  </label>
</template>
