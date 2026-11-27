<script setup lang="ts">
// The toolbar of an entry list (Pages and Content, 014 §8): search and the
// status filter on the left, creating on the right, apart from them.
import { computed } from 'vue'
import { ENTRY_STATUS_FILTERS } from '../../admin/useAdminEntries'
import { useAdminI18n } from '../../admin/useAdminI18n'
import { documentStatusTone, shownStatus } from '../../admin/status-tone'
import type { CmsEntryStatus } from '../../types/entries'

const search = defineModel<string>('search', { required: true })
const statuses = defineModel<CmsEntryStatus[]>('statuses', { required: true })

defineProps<{
  /** The create button's words; no button without them. */
  newLabel?: string
}>()

const emit = defineEmits<{ create: [] }>()

const { t } = useAdminI18n()

const statusOptions = computed(() => ENTRY_STATUS_FILTERS.map(value => ({ value, label: t(`cms.pages.status.${value}`) })))
</script>

<template>
  <div class="entry-filters">
    <div class="entry-filters__group">
      <div class="entry-filters__search">
        <AdminInput
          v-model="search"
          type="search"
          :label="t('cms.pages.type.search')"
          :placeholder="t('cms.pages.type.searchPlaceholder')"
          hide-label
          data-test="entries-search"
        >
          <template #leading>
            <Icon
              name="lucide:search"
              aria-hidden="true"
            />
          </template>
        </AdminInput>
      </div>
      <AdminSelect
        v-model:values="statuses"
        multiple
        :options="statusOptions"
        :label="t('cms.pages.type.statusFilter')"
        :placeholder="t('cms.pages.type.statusAll')"
        label-placement="hidden"
        class="entry-filters__status"
        data-test="entries-status"
      >
        <template #option="{ option }">
          <AdminBadge :tone="documentStatusTone(shownStatus(option.value))">
            {{ option.label }}
          </AdminBadge>
        </template>
      </AdminSelect>
    </div>
    <AdminButton
      v-if="newLabel"
      type="button"
      variant="primary"
      size="md"
      class="entry-filters__new"
      data-test="entries-new"
      @click="emit('create')"
    >
      <template #leading>
        <Icon
          name="lucide:plus"
          aria-hidden="true"
        />
      </template>
      {{ newLabel }}
    </AdminButton>
  </div>
</template>

<style scoped>
.entry-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cms-space-3) var(--cms-space-6);
}

.entry-filters__group {
  display: flex;
  flex: 1 1 32rem;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-2);
  max-width: 44rem;
}

.entry-filters__search {
  flex: 1 1 14rem;
  max-width: 22rem;
}

.entry-filters__status {
  flex: 1 1 12rem;
  max-width: 20rem;
}

@media (max-width: 767px) {
  .entry-filters__search,
  .entry-filters__status {
    max-width: none;
  }

  .entry-filters__new {
    width: 100%;
  }
}
</style>
