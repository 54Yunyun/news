<script setup>
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-12 border-t border-line pt-6 pb-10 text-sm leading-6 text-muted">
    <p>摘要由 AI 產生，請以原文為準。</p>
    <p class="mt-4">© {{ year }} 每日新聞</p>
  </footer>
</template>
