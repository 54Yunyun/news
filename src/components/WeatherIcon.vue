<script setup>
defineProps({
  code: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <svg
    class="block"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="code === 'sunny'">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6 4.9 19.1"
      />
    </template>
    <template v-else-if="code === 'partly-cloudy'">
      <path d="M16.2 5.6 15 6.8M18.8 9.2h-1.5M12.8 3.8v1.5" />
      <circle cx="12.8" cy="8.2" r="2.3" />
      <path d="M6.8 18h9.4a3.5 3.5 0 0 0 .4-7 5.2 5.2 0 0 0-9.8 1.8A3.3 3.3 0 0 0 6.8 18Z" />
    </template>
    <template v-else-if="code === 'rain'">
      <path d="M7 14.5h10a3.8 3.8 0 0 0 .4-7.6 5.2 5.2 0 0 0-10 1.7A3.3 3.3 0 0 0 7 14.5Z" />
      <path d="M9 17.2v2M12 17.2v2.4M15 17.2v2" />
    </template>
    <template v-else-if="code === 'thunderstorm'">
      <path d="M7 13.5h10a3.8 3.8 0 0 0 .4-7.6 5.2 5.2 0 0 0-10 1.7A3.3 3.3 0 0 0 7 13.5Z" />
      <path d="m11.2 14.2-1.8 3.4h2.2L10.2 21l4.2-4.6h-2.2l1.3-2.2Z" />
    </template>
    <template v-else-if="code === 'fog'">
      <path d="M4 8h16M4 12h16M6 16h12" />
    </template>
    <template v-else>
      <path d="M7 17.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.5 3.5 0 0 0 7 17.5Z" />
    </template>
  </svg>
</template>
