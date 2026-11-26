<script setup>
import { useTheme } from '../composables/useTheme.js'

defineProps({
  edition: {
    type: String,
    default: '',
  },
  dateLabel: {
    type: String,
    required: true,
  },
  generatedLabel: {
    type: String,
    default: '',
  },
  weatherUpdatedLabel: {
    type: String,
    default: '',
  },
})

const { dark, label, cycle } = useTheme()
</script>

<template>
  <header class="relative text-center">
    <button
      type="button"
      class="absolute top-0 right-0 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line text-ink"
      :aria-label="label"
      @click="cycle"
    >
      <svg
        v-if="dark"
        class="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
      </svg>
      <svg
        v-else
        class="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    </button>
    <div class="px-12">
      <p v-if="edition" class="text-sm font-medium tracking-[0.28em] text-brand">{{ edition }}</p>
      <h1 class="mt-2 font-serif text-[2rem] font-bold leading-tight text-ink sm:text-4xl">
        每日新聞
      </h1>
      <p class="mt-3 font-serif text-lg font-semibold text-ink">{{ dateLabel }}</p>
      <p v-if="generatedLabel || weatherUpdatedLabel" class="mt-2 text-sm text-muted">
        <span v-if="generatedLabel">更新時間 {{ generatedLabel }}</span>
        <span v-if="generatedLabel && weatherUpdatedLabel" aria-hidden="true"> · </span>
        <span v-if="weatherUpdatedLabel">天氣更新 {{ weatherUpdatedLabel }}</span>
      </p>
    </div>
    <div class="mt-5 space-y-1" aria-hidden="true">
      <div class="h-[3px] bg-ink"></div>
      <div class="h-px bg-ink"></div>
    </div>
  </header>
</template>
