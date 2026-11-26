<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { categoryLabel } from '../constants/categories.js'
import { formatNewsTime } from '../utils/format.js'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  fresh: {
    type: Boolean,
    default: false,
  },
  variant: {
    type: String,
    default: 'full',
  },
  topicItems: {
    type: Array,
    default: () => [],
  },
})

const open = ref(false)
const topicOpen = ref(false)

// 分類的中文名稱
// 回傳: 如「國際」
const label = computed(() => categoryLabel(props.item.category))

// 畫面上的發布時間
// 回傳: 如「今天 05:40」
const timeLabel = computed(() => formatNewsTime(props.item.publishedAt))

// 各家來源。舊檔沒有 sources 時，用單篇的來源與連結
// 回傳: 來源陣列
const outlets = computed(() => {
  if (Array.isArray(props.item.sources) && props.item.sources.length) return props.item.sources
  if (props.item.source && props.item.url) {
    return [{
      name: props.item.source,
      title: props.item.title,
      url: props.item.url,
      publishedAt: props.item.publishedAt,
    }]
  }
  return []
})

// 兩家以上才顯示媒體標籤與展開區
// 回傳: 是否為多家事件
const multiple = computed(() => (props.item.sourceCount ?? outlets.value.length) >= 2 && outlets.value.length >= 2)

// 畫面上的家數
// 回傳: 正整數
const sourceCount = computed(() => props.item.sourceCount ?? outlets.value.length)

// 單一來源的那一家
// 回傳: 來源，沒有時回傳 null
const primary = computed(() => outlets.value[0] ?? null)

// 緊湊列上的媒體名稱。多家時帶上家數
// 回傳: 媒體文字
const mediaLabel = computed(() => {
  if (!primary.value) return ''
  if (outlets.value.length <= 1) return primary.value.name
  return `${primary.value.name}等 ${outlets.value.length} 家`
})

// 標題字級。大卡比一般卡片大，話題裡的面向小一號
// 回傳: class 字串
const titleClass = computed(() => {
  if (props.variant === 'lead') return 'mt-2 text-pretty font-serif text-3xl font-semibold leading-snug text-ink sm:text-4xl'
  if (props.variant === 'facet') return 'mt-2 text-pretty font-serif text-lg font-semibold leading-snug text-ink'
  return 'mt-2 text-pretty font-serif text-xl font-semibold leading-snug text-ink'
})

// 1–2 家且不在頭條時，收成一行
// 回傳: 是否為緊湊列
const compact = computed(() => props.variant === 'compact')

// 頭條橫跨整列，桌機以上左文右重點
// 回傳: 是否為頭條大卡
const lead = computed(() => props.variant === 'lead')

// 卡片外框。次頭條要撐滿格子，同一列才等高
// 回傳: class 字串
const articleClass = computed(() => {
  const base = 'rounded-2xl border border-line bg-card px-5 py-5 sm:px-6'
  if (props.variant === 'side') return `${base} flex h-full flex-col`
  return base
})

// 頭條內文在中寬以上分成兩欄。次頭條用直向排版，把按鈕推到底
// 回傳: class 字串
const bodyClass = computed(() => {
  if (lead.value) return 'grid gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-start md:gap-10'
  if (props.variant === 'side') return 'flex flex-1 flex-col'
  return ''
})

// 各家都提到的事實
// 回傳: 文字陣列
const facts = computed(() => (Array.isArray(props.item.commonFacts) ? props.item.commonFacts.filter(Boolean) : []))

// 展開區的 id
// 回傳: 供 aria-controls 使用
const panelId = computed(() => `sources-${props.item.id}`)

const narrow = ref(false)
let chipMedia
let onChipMedia

// 窄螢幕少顯示一家，讓標籤維持一列
// 回傳: 無
onMounted(() => {
  chipMedia = window.matchMedia('(max-width: 639px)')
  onChipMedia = () => { narrow.value = chipMedia.matches }
  onChipMedia()
  chipMedia.addEventListener('change', onChipMedia)
})

onUnmounted(() => chipMedia?.removeEventListener('change', onChipMedia))

// 頭條的媒體標籤最多四個，窄螢幕三個，避免排成兩列
// 回傳: 要畫出來的來源
const shownOutlets = computed(() => {
  if (props.variant !== 'lead') return []
  return outlets.value.slice(0, narrow.value ? 3 : 4)
})

// 頭條沒顯示的家數
// 回傳: 0 或正整數
const extraOutlets = computed(() => {
  if (props.variant !== 'lead') return 0
  return Math.max(0, outlets.value.length - shownOutlets.value.length)
})

// 次頭條用一行文字列出媒體
// 回傳: 如「自由時報、ETtoday 等 3 家」
const sideMedia = computed(() => {
  const names = outlets.value.map((source) => source.name).filter(Boolean)
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 家`
})

// 次頭條畫面上只留兩點，其餘放進展開區
// 回傳: 重點陣列
const visibleHighlights = computed(() => {
  const points = props.item.highlights ?? []
  if (props.variant === 'side') return points.slice(0, 2)
  return points
})

// 展開或收合各家報導
// 回傳: 無
const toggle = () => {
  open.value = !open.value
}

// 展開或收合同一話題的其他面向
// 回傳: 無
const toggleTopic = () => {
  topicOpen.value = !topicOpen.value
}
</script>

<template>
  <article v-if="compact" class="rounded-2xl border border-line bg-card px-5 py-1 sm:px-6">
    <button
      type="button"
      class="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left"
      :title="item.title"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="toggle"
    >
      <span class="shrink-0 rounded-full bg-brand/10 px-1.5 text-xs font-medium leading-5 text-brand">{{ label }}</span>
      <span
        class="min-w-0 font-medium break-words text-ink"
        :class="open ? 'w-full' : 'w-full sm:flex-1 sm:truncate'"
      >{{ item.title }}</span>
      <span v-if="fresh" class="shrink-0 rounded-full bg-brand px-1.5 text-xs font-medium leading-5 text-white dark:text-ink">新</span>
      <span class="w-full text-sm break-words text-muted sm:w-auto sm:max-w-[40%] sm:truncate">
        {{ mediaLabel }}
        <span aria-hidden="true"> · </span>
        <time :datetime="item.publishedAt">{{ timeLabel }}</time>
      </span>
    </button>
    <div v-if="open" :id="panelId" class="border-t border-line pb-4">
      <ul class="mt-3 space-y-2">
        <li
          v-for="(point, index) in item.highlights ?? []"
          :key="index"
          class="flex gap-3 text-[15px] leading-7 text-ink"
        >
          <span class="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
          <span>{{ point }}</span>
        </li>
      </ul>
      <a
        v-if="primary?.url"
        class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand underline decoration-1 underline-offset-4"
        :href="primary.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        閱讀原文
        <span class="sr-only">（另開新視窗）</span>
      </a>
    </div>
  </article>
  <article v-else :class="articleClass">
    <div :class="bodyClass">
    <div>
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p class="flex items-center gap-2 text-sm font-medium text-brand">
        <span>{{ label }}</span>
        <span
          v-if="fresh"
          class="rounded-full bg-brand px-1.5 text-xs font-medium leading-5 text-white dark:text-ink"
        >新</span>
      </p>
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <template v-if="multiple && lead">
          <span>{{ sourceCount }} 家報導</span>
        </template>
        <template v-else-if="variant === 'side' && sideMedia">
          <span>{{ sideMedia }}</span>
        </template>
        <template v-else-if="primary">
          <span>{{ primary.name }}</span>
        </template>
        <span aria-hidden="true"> · </span>
        <time :datetime="item.publishedAt">{{ timeLabel }}</time>
        <button
          v-if="variant === 'side' && topicItems.length"
          type="button"
          class="inline-flex h-7 items-center rounded-full border border-line px-2 text-xs text-brand"
          :aria-expanded="topicOpen"
          @click="toggleTopic"
        >
          相關 {{ topicItems.length }} 則
        </button>
      </p>
    </div>
    <ul v-if="lead && multiple" class="mt-3 flex flex-wrap items-center gap-2" aria-label="報導媒體">
      <li
        v-for="source in shownOutlets"
        :key="source.url"
        class="inline-flex h-7 items-center rounded-full border border-line px-3 text-sm text-ink"
      >
        {{ source.name }}
      </li>
      <li v-if="extraOutlets">
        <button
          type="button"
          class="relative inline-flex h-7 cursor-pointer items-center rounded-full border border-line px-3 text-sm text-ink before:absolute before:-inset-x-1 before:-inset-y-2"
          @click="toggle"
        >
          +{{ extraOutlets }}
        </button>
      </li>
    </ul>
    <h3 :class="titleClass">
      {{ item.title }}
    </h3>
    </div>
    <div :class="variant === 'side' ? 'flex flex-1 flex-col' : ''">
    <ul class="mt-3 space-y-2" :class="lead ? 'md:mt-0' : ''">
      <li
        v-for="(point, index) in visibleHighlights"
        :key="index"
        class="flex gap-3 text-[15px] leading-7 text-ink"
      >
        <span class="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
        <span>{{ point }}</span>
      </li>
    </ul>
    <a
      v-if="!multiple && primary?.url"
      class="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand underline decoration-1 underline-offset-4"
      :href="primary.url"
      target="_blank"
      rel="noopener noreferrer"
    >
      閱讀原文
      <svg
        class="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
      <span class="sr-only">（另開新視窗）</span>
    </a>
    <div v-if="multiple" :class="variant === 'side' ? 'mt-auto pt-3' : 'mt-3'">
      <button
        type="button"
        class="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand underline decoration-1 underline-offset-4"
        :aria-expanded="open"
        :aria-controls="panelId"
        @click="toggle"
      >
        {{ open ? '收合各家報導' : '各家報導' }}
      </button>
      <div v-if="open" :id="panelId" class="mt-3 border-t border-line pt-3">
        <section v-if="variant === 'side' && (item.highlights ?? []).length" class="mb-4">
          <h4 class="text-sm font-medium text-ink">完整重點</h4>
          <ul class="mt-2 space-y-2">
            <li v-for="(point, index) in item.highlights" :key="index" class="text-[15px] leading-7 text-ink">
              {{ point }}
            </li>
          </ul>
        </section>
        <section v-if="facts.length" class="mb-4">
          <h4 class="text-sm font-medium text-ink">各家都提到</h4>
          <ul class="mt-2 space-y-2">
            <li v-for="(fact, index) in facts" :key="index" class="text-[15px] leading-7 text-ink">
              {{ fact }}
            </li>
          </ul>
        </section>
        <ul class="space-y-4">
          <li v-for="source in outlets" :key="source.url">
            <p class="text-sm font-medium text-ink">{{ source.name }}</p>
            <p v-if="source.angle" class="mt-1 text-[15px] leading-7 text-ink">{{ source.angle }}</p>
            <p class="mt-1 text-sm leading-6 text-muted">{{ source.title }}</p>
            <p class="text-sm text-muted">
              <time :datetime="source.publishedAt">{{ formatNewsTime(source.publishedAt) }}</time>
            </p>
            <a
              v-if="source.url"
              class="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand underline decoration-1 underline-offset-4"
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              閱讀原文
              <span class="sr-only">：{{ source.name }}（另開新視窗）</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
    </div>
    </div>
    <div v-if="!lead && topicOpen && topicItems.length" class="mt-4 space-y-3 border-t border-line pt-3">
      <NewsCard
        v-for="topicItem in topicItems"
        :key="topicItem.id"
        :item="topicItem"
        variant="facet"
      />
    </div>
    <div v-if="lead && topicItems.length" class="mt-4 border-t border-line pt-3">
      <button
        type="button"
        class="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand underline decoration-1 underline-offset-4"
        :aria-expanded="topicOpen"
        :aria-controls="`${panelId}-topic`"
        @click="toggleTopic"
      >
        {{ topicOpen ? '收合這個話題' : `這個話題還有 ${topicItems.length} 則` }}
      </button>
      <div v-if="topicOpen" :id="`${panelId}-topic`" class="mt-3 space-y-3">
        <NewsCard
          v-for="topicItem in topicItems"
          :key="topicItem.id"
          :item="topicItem"
          variant="facet"
        />
      </div>
    </div>
  </article>
</template>
