<script setup lang="ts">
import { computed } from 'vue'
import { useAdminI18n } from '../../admin/useAdminI18n'

const { locale, locales, setLocale, t } = useAdminI18n()

const options = computed(() => locales.map(item => ({ value: item.code, label: item.name })))
const current = computed({
  get: () => locale.value,
  set: (code) => {
    if (code) {
      setLocale(code)
    }
  },
})
</script>

<template>
  <AdminSelect
    v-model="current"
    class="admin-locale-switch"
    :options="options"
    :label="t('cms.locale.label')"
    label-placement="inline"
    size="sm"
  />
</template>

<style scoped>
.admin-locale-switch :deep(.admin-select__field) {
  flex: none;
  width: 8.5rem;
}
</style>
