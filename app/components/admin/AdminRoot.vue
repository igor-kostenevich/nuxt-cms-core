<script setup lang="ts">
import '../../assets/admin/admin.css'
import { useAdminI18n } from '../../admin/useAdminI18n'

const { locale } = useAdminI18n()

// Admin text is in the admin language, not the site's, so screen readers and
// hyphenation need the document language to follow it.
useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <div class="cms-admin">
    <slot />
  </div>
</template>
