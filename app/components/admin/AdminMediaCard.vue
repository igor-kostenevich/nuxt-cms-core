<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes, mediaTypeLabel } from '../../admin/media/files'
import { cmsContent } from '#cms/content'
import { contentLabel } from '../../admin/content-label'
import { usageLabels } from '../../admin/media/usage'
import { useAdminI18n } from '../../admin/useAdminI18n'
import type { CmsMedia, CmsMediaUsage } from '../../types/media'

// One file of the library grid (design: Figma "Media", node 18:11399). The
// whole card is a button: in the library it opens the file, in the Picker it
// chooses it.
const props = defineProps<{
  media: CmsMedia
  usage: CmsMediaUsage[]
  /** Picker: the current choice. */
  selected?: boolean
}>()

defineEmits<{ activate: [media: CmsMedia] }>()

const { t, locale } = useAdminI18n()
const labels = computed(() => usageLabels(props.usage, t, type =>
  contentLabel(cmsContent.types.find(item => item.key === type)?.label, locale.value) || type))
const isSvg = computed(() => props.media.mime === 'image/svg+xml')
</script>

<template>
  <button
    type="button"
    class="media-card"
    :class="{ 'media-card--selected': selected }"
    :aria-pressed="selected === undefined ? undefined : selected"
    @click="$emit('activate', media)"
  >
    <span
      class="media-card__thumb"
      :class="{ 'media-card__thumb--contain': isSvg }"
    >
      <!-- SVG renders only through <img>: its scripts never run (C-75). -->
      <img
        :src="media.url"
        alt=""
        loading="lazy"
        decoding="async"
        :width="media.width ?? undefined"
        :height="media.height ?? undefined"
      >
      <span
        v-if="isSvg"
        class="media-card__type"
        aria-hidden="true"
      >{{ mediaTypeLabel(media.mime) }}</span>
    </span>
    <span class="media-card__info">
      <span class="media-card__name">{{ media.name }}</span>
      <span class="media-card__size">{{ formatBytes(media.size, locale) }}</span>
      <span
        v-if="labels.length"
        class="media-card__usage"
      >
        <span class="media-card__usage-label">{{ t('cms.media.usedIn') }}</span>
        <span class="media-card__badges">
          <span
            v-for="label in labels"
            :key="label"
            class="media-card__badge"
          >{{ label }}</span>
        </span>
      </span>
      <span
        v-else
        class="media-card__unused"
      >
        <Icon
          name="lucide:circle-alert"
          aria-hidden="true"
        />
        {{ t('cms.media.unused') }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.media-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: var(--cms-border-width) solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-card);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.media-card:hover {
  border-color: var(--cms-border-strong);
  box-shadow: var(--cms-shadow-sm);
}

.media-card:focus-visible {
  outline: none;
  box-shadow: var(--cms-focus-ring);
}

.media-card--selected {
  border-color: var(--cms-primary);
  box-shadow: 0 0 0 1px var(--cms-primary);
}

.media-card__thumb {
  position: relative;
  display: block;
  height: 8.125rem;
  background: var(--cms-surface-secondary);
}

.media-card__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-card__thumb--contain img {
  padding: var(--cms-space-4);
  object-fit: contain;
}

.media-card__type {
  position: absolute;
  inset-block-start: var(--cms-space-2);
  inset-inline-start: var(--cms-space-2);
  padding: 0 var(--cms-space-1);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-neutral-900);
  color: var(--cms-neutral-0);
  font-size: var(--cms-type-micro-size);
  font-weight: 700;
  line-height: 1.6;
}

.media-card__info {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-1);
  padding: var(--cms-space-2) var(--cms-space-3) var(--cms-space-3);
}

.media-card__name {
  overflow: hidden;
  font-size: var(--cms-type-body-small-size);
  line-height: var(--cms-type-body-small-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-card__size,
.media-card__usage-label {
  color: var(--cms-text-tertiary);
  font-size: var(--cms-type-caption-size);
  line-height: var(--cms-type-caption-line);
}

.media-card__usage {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-1);
}

.media-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cms-space-1);
}

.media-card__badge {
  padding: 0 var(--cms-space-2);
  border-radius: var(--cms-radius-sm);
  background: var(--cms-info-subtle);
  color: var(--cms-info-text);
  font-size: var(--cms-type-caption-size);
  font-weight: var(--cms-type-label-small-weight);
  line-height: var(--cms-type-caption-line);
}

.media-card__unused {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-1);
  color: var(--cms-warning);
  font-size: var(--cms-type-caption-size);
  line-height: var(--cms-type-caption-line);
}

.media-card__unused :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}
</style>
