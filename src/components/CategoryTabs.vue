<script setup>
import { computed, nextTick, ref } from 'vue'
import { categories } from '../constants/categories.js'

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const tabRefs = ref({})

// 目前分類的中文名稱，供螢幕閱讀器朗讀
// 回傳: 如「全部」
const activeLabel = computed(() => {
  return categories.find((item) => item.id === props.modelValue)?.label ?? ''
})

// 記住按鈕元素，鍵盤移動後用來聚焦
// id: 分類代碼
// el: 按鈕元素，卸載時為 null
// 回傳: 無
const setTabRef = (id, el) => {
  if (el) tabRefs.value[id] = el
  else delete tabRefs.value[id]
}

// 選取分類。鍵盤操作時把焦點移到對應按鈕
// id: 分類代碼
// moveFocus: 是否移動焦點
// 回傳: 無
const select = async (id, moveFocus = false) => {
  emit('update:modelValue', id)
  if (!moveFocus) return
  await nextTick()
  const el = tabRefs.value[id]
  el?.focus()
  el?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}

// 用方向鍵、Home、End 在分類間移動
// event: 鍵盤事件
// 回傳: 無
const onKeydown = (event) => {
  const ids = categories.map((item) => item.id)
  const index = ids.indexOf(props.modelValue)
  let nextId = null

  if (event.key === 'ArrowRight') nextId = ids[(index + 1) % ids.length]
  else if (event.key === 'ArrowLeft') nextId = ids[(index - 1 + ids.length) % ids.length]
  else if (event.key === 'Home') nextId = ids[0]
  else if (event.key === 'End') nextId = ids[ids.length - 1]

  if (!nextId) return
  event.preventDefault()
  select(nextId, true)
}
</script>

<template>
  <div>
    <p class="sr-only" aria-live="polite">{{ activeLabel }}，{{ count }} 則</p>
    <p class="mb-1 text-right text-sm text-muted sm:hidden" aria-hidden="true">{{ count }} 則</p>
    <div class="border-b border-line">
      <div class="flex items-center">
        <div
          class="tab-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-1.5"
          role="tablist"
          aria-label="新聞分類"
        >
          <button
            v-for="item in categories"
            :id="`tab-${item.id}`"
            :key="item.id"
            :ref="(el) => setTabRef(item.id, el)"
            type="button"
            role="tab"
            class="relative min-h-11 min-w-[5.25rem] shrink-0 cursor-pointer whitespace-nowrap px-4 text-base"
            :class="
              item.id === modelValue ? 'font-medium text-brand' : 'text-muted hover:text-ink'
            "
            :aria-selected="item.id === modelValue"
            :tabindex="item.id === modelValue ? 0 : -1"
            @click="select(item.id)"
            @keydown="onKeydown"
          >
            {{ item.label }}
            <span
              class="absolute inset-x-3 bottom-1 h-0.5 rounded-full"
              :class="item.id === modelValue ? 'bg-brand' : 'bg-transparent'"
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <p
          class="hidden min-h-11 shrink-0 items-center pr-1 pl-4 text-sm text-muted sm:flex"
          aria-hidden="true"
        >
          {{ count }} 則
        </p>
      </div>
    </div>
  </div>
</template>
