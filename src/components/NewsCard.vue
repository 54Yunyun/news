<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
const broken = ref(false)
const narrow = ref(false)
let chipMedia
let onChipMedia

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

// 只留 http 與 https，避免把其他協定放進圖片位址
// value: 網址
// 回傳: 絕對網址，不合格時回傳空字串
const httpUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

// 頭條與次要才顯示封面。沒有網址就當成沒有圖
// 回傳: { url, sourceName }，沒有時回傳 null
const photo = computed(() => {
  if (props.variant !== 'lead' && props.variant !== 'side') return null
  const image = props.item.image
  const url = httpUrl(image?.url)
  if (!url) return null
  return { url, sourceName: image.sourceName || '' }
})

// 圖片載入失敗後改走沒有圖的版面
// 回傳: 是否畫出圖片
const showPhoto = computed(() => Boolean(photo.value) && !broken.value)

// 重點，空字串不算
// 回傳: 文字陣列
const points = computed(() => (Array.isArray(props.item.highlights) ? props.item.highlights.filter(Boolean) : []))

// 頭條最多兩條，話題裡的面向全部列出。次要改用一句摘要
// 回傳: 重點陣列
const facePoints = computed(() => {
  if (props.variant === 'lead') return points.value.slice(0, 2)
  if (props.variant === 'facet') return points.value
  return []
})

// 次要卡片的一句摘要
// 回傳: 句子，沒有時回傳空字串
const summary = computed(() => (props.variant === 'side' ? points.value[0] || '' : ''))

// 各家都提到的事實
// 回傳: 文字陣列
const facts = computed(() => (Array.isArray(props.item.commonFacts) ? props.item.commonFacts.filter(Boolean) : []))

// 單行列表
// 回傳: 是否為列表列
const row = computed(() => props.variant === 'row')

// 頭條
// 回傳: 是否為頭條
const lead = computed(() => props.variant === 'lead')

// 次要
// 回傳: 是否為次要
const side = computed(() => props.variant === 'side')

// 話題裡的面向
// 回傳: 是否為面向
const facet = computed(() => props.variant === 'facet')

// 標題字級。頭條比次要大，話題裡的面向小一號
// 回傳: class 字串
const titleClass = computed(() => {
  if (lead.value) return 'mt-2 text-pretty font-serif text-3xl font-semibold leading-snug text-ink sm:text-4xl'
  if (facet.value) return 'mt-2 text-pretty font-serif text-lg font-semibold leading-snug text-ink'
  return 'mt-2 text-pretty font-serif text-xl font-semibold leading-snug text-ink'
})

// 卡片外框。列表列由外層列表提供框線
// 回傳: class 字串
const shellClass = computed(() => {
  if (row.value) return 'px-4 sm:px-5'
  return 'rounded-2xl border border-line bg-card px-5 py-5 sm:px-6'
})

// 次要在桌機改成左圖右文，窄螢幕維持上圖下文
// 回傳: class 字串
const bodyClass = computed(() => (side.value ? 'flex flex-col gap-4 sm:flex-row sm:items-start' : ''))

// 展開區的 id
// 回傳: 供 aria-controls 使用
const panelId = computed(() => `sources-${props.item.id}`)

// 次要用一行文字列出媒體與家數
// 回傳: 如「自由時報、ETtoday 等 3 家」或「自由時報、ETtoday · 2 家」
const sideMedia = computed(() => {
  const names = outlets.value.map((source) => source.name).filter(Boolean)
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names.join('、')} · ${sourceCount.value} 家`
  return `${names.slice(0, 2).join('、')} 等 ${sourceCount.value} 家`
})

// 窄螢幕少顯示一家，讓標籤維持一列
// 回傳: 無
onMounted(() => {
  chipMedia = window.matchMedia('(max-width: 639px)')
  onChipMedia = () => { narrow.value = chipMedia.matches }
  onChipMedia()
  chipMedia.addEventListener('change', onChipMedia)
})

onUnmounted(() => chipMedia?.removeEventListener('change', onChipMedia))

// 換一則新聞時，重新允許顯示圖片
// 回傳: 無
watch(() => props.item?.id, () => {
  broken.value = false
  open.value = false
  topicOpen.value = false
})

// 頭條的媒體標籤最多四個，窄螢幕三個
// 回傳: 要畫出來的來源
const shownOutlets = computed(() => {
  if (!lead.value) return []
  return outlets.value.slice(0, narrow.value ? 3 : 4)
})

// 頭條沒顯示的家數
// 回傳: 0 或正整數
const extraOutlets = computed(() => {
  if (!lead.value) return 0
  return Math.max(0, outlets.value.length - shownOutlets.value.length)
})

// 圖片載入失敗就收起，改回沒有圖的版面
// 回傳: 無
const hidePhoto = () => {
  broken.value = true
}

// 展開或收合各家報導。列表列同時展開重點
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
  <article :class="shellClass">
    <button
      v-if="row"
      type="button"
      class="flex min-h-11 w-full cursor-pointer items-center gap-1.5 py-3 text-left sm:gap-2"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="toggle"
    >
      <span class="shrink-0 rounded-full bg-brand/10 px-1.5 text-xs font-medium leading-5 text-brand">{{ label }}</span>
      <span class="min-w-0 flex-1 text-sm font-medium text-ink sm:text-base" :class="open ? 'whitespace-normal' : 'truncate'">{{ item.title }}</span>
      <span v-if="fresh" class="shrink-0 rounded-full bg-brand px-1.5 text-xs font-medium leading-5 text-white dark:text-ink">新</span>
      <span class="shrink-0 text-xs text-muted whitespace-nowrap sm:text-sm">{{ sourceCount }} 家</span>
      <time class="shrink-0 text-xs text-muted whitespace-nowrap sm:text-sm" :datetime="item.publishedAt">{{ timeLabel }}</time>
    </button>

    <div v-else :class="bodyClass">
      <figure v-if="showPhoto" :class="side ? 'w-full sm:w-52 sm:shrink-0' : 'mb-4'">
        <div
          class="relative w-full overflow-hidden rounded-xl"
          :class="lead ? 'aspect-video max-h-[280px] sm:aspect-[21/9]' : 'aspect-[4/3]'"
        >
          <img
            :src="photo.url"
            :alt="item.title"
            class="absolute inset-0 size-full object-cover"
            loading="lazy"
            referrerpolicy="no-referrer"
            decoding="async"
            @error="hidePhoto"
          />
          <figcaption
            v-if="photo.sourceName"
            class="photo-credit absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] leading-tight text-white"
          >
            圖：{{ photo.sourceName }}
          </figcaption>
        </div>
      </figure>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p class="flex items-center gap-2 text-sm font-medium text-brand">
            <span>{{ label }}</span>
            <span v-if="fresh" class="rounded-full bg-brand px-1.5 text-xs font-medium leading-5 text-white dark:text-ink">新</span>
          </p>
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <template v-if="multiple && lead">
              <span>{{ sourceCount }} 家報導</span>
              <span aria-hidden="true"> · </span>
            </template>
            <template v-else-if="!side && primary">
              <span>{{ primary.name }}</span>
              <span aria-hidden="true"> · </span>
            </template>
            <time :datetime="item.publishedAt">{{ timeLabel }}</time>
            <button
              v-if="side && topicItems.length"
              type="button"
              class="inline-flex h-7 cursor-pointer items-center rounded-full border border-line px-2 text-xs text-brand"
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
        <h3 :class="titleClass">{{ item.title }}</h3>
        <ul v-if="facePoints.length" class="mt-3 space-y-2">
          <li v-for="(point, index) in facePoints" :key="index" class="flex gap-3 text-[15px] leading-7 text-ink">
            <span class="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
            <span>{{ point }}</span>
          </li>
        </ul>
        <p v-if="summary" class="mt-2 text-[15px] leading-7 text-ink">{{ summary }}</p>
        <div v-if="side && multiple" class="side-footer mt-3 flex items-center justify-between gap-2">
          <p class="min-w-0 truncate text-xs text-muted sm:text-sm">{{ sideMedia }}</p>
          <button
            type="button"
            class="side-sources-btn ml-auto inline-flex min-h-8 shrink-0 cursor-pointer items-center rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand"
            :aria-expanded="open"
            :aria-controls="panelId"
            @click="toggle"
          >
            {{ open ? '收合各家報導' : '各家報導' }}
          </button>
        </div>
        <div v-else-if="side" class="side-footer mt-3 flex items-center justify-between gap-2">
          <p v-if="primary" class="min-w-0 truncate text-xs text-muted sm:text-sm">{{ primary.name }}</p>
          <a
            v-if="primary?.url"
            class="side-sources-btn ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand"
            :href="primary.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            閱讀原文
            <span class="sr-only">（另開新視窗）</span>
          </a>
        </div>
        <a
          v-else-if="!multiple && primary?.url"
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
        <div v-else-if="multiple" class="mt-3">
          <button
            type="button"
            class="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand underline decoration-1 underline-offset-4"
            :aria-expanded="open"
            :aria-controls="panelId"
            @click="toggle"
          >
            {{ open ? '收合各家報導' : '各家報導' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="open" :id="panelId" class="border-t border-line py-4">
      <ul v-if="row && points.length" class="space-y-2">
        <li v-for="(point, index) in points" :key="index" class="flex gap-3 text-[15px] leading-7 text-ink">
          <span class="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>
          <span>{{ point }}</span>
        </li>
      </ul>
      <section v-else-if="points.length > facePoints.length" :class="row ? '' : 'mb-4'">
        <h4 class="text-sm font-medium text-ink">完整重點</h4>
        <ul class="mt-2 space-y-2">
          <li v-for="(point, index) in points" :key="index" class="text-[15px] leading-7 text-ink">{{ point }}</li>
        </ul>
      </section>
      <section v-if="facts.length" class="mt-4">
        <h4 class="text-sm font-medium text-ink">各家都提到</h4>
        <ul class="mt-2 space-y-2">
          <li v-for="(fact, index) in facts" :key="index" class="text-[15px] leading-7 text-ink">{{ fact }}</li>
        </ul>
      </section>
      <h4 v-if="row" class="mt-4 text-sm font-medium text-ink">各家報導</h4>
      <ul class="space-y-4" :class="row ? 'mt-2' : 'mt-4'">
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

    <div v-if="!lead && !row && topicOpen && topicItems.length" class="mt-4 space-y-3 border-t border-line pt-3">
      <NewsCard v-for="topicItem in topicItems" :key="topicItem.id" :item="topicItem" variant="facet" />
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
        <NewsCard v-for="topicItem in topicItems" :key="topicItem.id" :item="topicItem" variant="facet" />
      </div>
    </div>
  </article>
</template>
