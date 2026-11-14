<script setup lang="ts">
import { useAdminI18n } from '../../admin/useAdminI18n'
const { locale, locales, setLocale, t } = useAdminI18n()

function onChange(event: Event) {
  const target = event.target

  if (!(target instanceof HTMLSelectElement)) {
    return
  }

  setLocale(target.value)
}
</script>

<template>
  <label>
    {{ t('cms.locale.label') }}
    <select
      :value="locale"
      @change="onChange"
    >
      <option
        v-for="item in locales"
        :key="item.code"
        :value="item.code"
      >
        {{ item.name }}
      </option>
    </select>
  </label>
</template>
