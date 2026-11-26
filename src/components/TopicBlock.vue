<script setup>
import { computed, ref } from 'vue'
import NewsCard from './NewsCard.vue'

const props = defineProps({
  topicName: {
    type: String,
    required: true,
  },
  items: {
    type: Array,
    required: true,
  },
  freshIds: {
    type: Object,
    required: true,
  },
})

const open = ref(false)

// 展開區的 id
// 回傳: 供 aria-controls 使用
const panelId = computed(() => `topic-${props.items[0]?.topicId || props.topicName}`)

// 展開或收合這個話題的各面向
// 回傳: 無
const toggle = () => {
  open.value = !open.value
}
</script>

<template>
  <section class="rounded-2xl border border-line bg-card px-5 py-3 sm:px-6">
    <button
      type="button"
      class="flex min-h-11 w-full cursor-pointer items-baseline justify-between gap-3 text-left"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="toggle"
    >
      <span>
        <span class="text-sm font-medium text-brand">話題</span>
        <span class="ml-2 font-serif text-lg font-semibold text-ink">{{ topicName }}</span>
      </span>
      <span class="shrink-0 text-sm text-muted">{{ items.length }} 則</span>
    </button>
    <div v-if="open" :id="panelId" class="space-y-3 border-t border-line py-4">
      <NewsCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        variant="facet"
        :fresh="freshIds.has(item.id)"
      />
    </div>
  </section>
</template>
