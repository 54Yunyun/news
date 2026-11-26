<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import CategoryTabs from './components/CategoryTabs.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import NewsCard from './components/NewsCard.vue'
import TopicBlock from './components/TopicBlock.vue'
import WeatherCard from './components/WeatherCard.vue'
import { useBriefing } from './composables/useBriefing.js'
import { formatClock, formatEdition, formatMastheadDate } from './utils/format.js'

const {
  news,
  weather,
  cityId,
  cityOptions,
  selectCity,
  generatedAt,
  todayBrief,
  presented,
  isFresh,
  newsError,
  weatherError,
  category,
  sortMode,
  filteredNews,
  loading,
  selectCategory,
  setSortMode,
  load,
} = useBriefing()

// 刊頭日期，尚無資料時改顯示今天
// 回傳: 如「2026年11月23日 星期一」
const dateLabel = computed(() => formatMastheadDate(generatedAt.value))

// 版次。05–11 點晨間、11–17 點午間、17–05 點晚間
// 回傳: 晨間版、午間版或晚間版
const editionLabel = computed(() => formatEdition(generatedAt.value))

// 這份簡報的產生時分
// 回傳: 如「06:30」
const generatedLabel = computed(() => formatClock(generatedAt.value))

// 天氣資料的更新時分
// 回傳: 如「06:00」
const weatherUpdatedLabel = computed(() => formatClock(weather.value?.updatedAt))

// 這次更新才出現的事件 id，交給話題區塊判斷「新」
// 回傳: Set
const freshIds = computed(() => {
  const ids = new Set()
  for (const item of news.value) {
    if (isFresh(item)) ids.add(item.id)
  }
  return ids
})

// 同一個話題裡，畫面上這格以外的子事件
// item: 頭條或次頭條那一則
// 回傳: 其餘子事件
const topicSiblings = (item) => {
  if (!item?.topicId) return []
  return filteredNews.value.filter((other) => other.topicId === item.topicId && other.id !== item.id)
}

const weatherSlot = ref(null)
const weatherPinned = ref(false)
let weatherObserver

// 側欄裝得下整張天氣卡時才固定，否則跟著頁面捲動
// 回傳: 無
const placeWeather = () => {
  const node = weatherSlot.value
  if (!node || window.innerWidth < 1024) {
    weatherPinned.value = false
    return
  }
  weatherPinned.value = node.offsetHeight + 40 <= window.innerHeight
}

// 內容高度或視窗變了就重新判斷要不要固定
// 回傳: 無
const bindWeather = () => {
  weatherObserver?.disconnect()
  const node = weatherSlot.value
  if (!node) return
  weatherObserver = new ResizeObserver(placeWeather)
  weatherObserver.observe(node)
  placeWeather()
}

onMounted(() => {
  window.addEventListener('resize', placeWeather)
  nextTick(bindWeather)
})

onUnmounted(() => {
  weatherObserver?.disconnect()
  window.removeEventListener('resize', placeWeather)
})

watch(loading, (value) => {
  if (!value) nextTick(bindWeather)
})

// 新聞列表是空的時候要顯示的句子
// 回傳: 提示文字
const emptyNewsLabel = computed(() => {
  if (category.value === 'all' && news.value.length === 0) return '今天還沒有新聞。'
  return '這個分類目前沒有新聞。'
})
</script>

<template>
  <div class="mx-auto min-h-screen max-w-6xl px-4 py-6 font-sans text-ink antialiased sm:px-6 sm:py-10">
    <a class="skip-link" href="#news">跳至新聞列表</a>
    <Header
      :edition="editionLabel"
      :date-label="dateLabel"
      :generated-label="generatedLabel"
      :weather-updated-label="weatherUpdatedLabel"
    />

    <section
      v-if="!loading && todayBrief.length === 3"
      class="mt-8"
      aria-labelledby="brief-heading"
    >
      <h2 id="brief-heading" class="text-sm font-medium tracking-[0.2em] text-brand">今日重點</h2>
      <ol class="mt-3 space-y-2">
        <li
          v-for="(line, index) in todayBrief"
          :key="index"
          class="flex gap-3 font-serif text-lg leading-8 text-ink"
        >
          <span class="text-brand" aria-hidden="true">{{ index + 1 }}</span>
          <span>{{ line }}</span>
        </li>
      </ol>
    </section>

    <p v-if="loading" class="mt-10 text-center text-muted" role="status">正在讀取簡報…</p>

    <main
      v-else
      class="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-8"
    >
      <div v-if="weather" ref="weatherSlot" :class="weatherPinned ? 'lg:sticky lg:top-6' : ''">
        <WeatherCard
          :weather="weather"
          :cities="cityOptions"
          :city-id="cityId"
          @update:city-id="selectCity"
        />
      </div>
      <section
        v-else
        class="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center"
        role="alert"
      >
        <p>{{ weatherError }}</p>
        <button
          type="button"
          class="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-sm font-medium text-ink"
          @click="load"
        >
          重新載入
        </button>
      </section>

      <section id="news" class="min-w-0 scroll-mt-6" aria-labelledby="news-heading">
        <h2 id="news-heading" class="sr-only">新聞列表</h2>
        <div v-if="newsError" class="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center" role="alert">
          <p>{{ newsError }}</p>
          <button
            type="button"
            class="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-sm font-medium text-ink"
            @click="load"
          >
            重新載入
          </button>
        </div>
        <template v-else>
          <CategoryTabs
            :model-value="category"
            :count="filteredNews.length"
            @update:model-value="selectCategory"
          />
          <div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="排序">
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm"
              :class="sortMode === 'coverage' ? 'border-brand font-medium text-brand' : 'border-line text-muted'"
              :aria-pressed="sortMode === 'coverage'"
              @click="setSortMode('coverage')"
            >
              多家優先
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm"
              :class="sortMode === 'time' ? 'border-brand font-medium text-brand' : 'border-line text-muted'"
              :aria-pressed="sortMode === 'time'"
              @click="setSortMode('time')"
            >
              依時間
            </button>
          </div>
          <div
            id="news-list"
            class="mt-4 flex flex-col gap-4"
            role="tabpanel"
            :aria-labelledby="`tab-${category}`"
          >
            <div v-if="presented.lead" class="flex flex-col gap-4">
              <NewsCard
                :item="presented.lead"
                :topic-items="topicSiblings(presented.lead)"
                variant="lead"
                :fresh="isFresh(presented.lead)"
              />
              <div
                v-if="presented.sides.length"
                class="grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]"
              >
                <NewsCard
                  v-for="item in presented.sides"
                  :key="item.id"
                  class="h-full"
                  :item="item"
                  :topic-items="topicSiblings(item)"
                  variant="side"
                  :fresh="isFresh(item)"
                />
              </div>
            </div>
            <template v-for="block in presented.blocks" :key="block.topicId || block.item.id">
              <TopicBlock
                v-if="block.type === 'topic'"
                :topic-name="block.topicName"
                :items="block.items"
                :fresh-ids="freshIds"
              />
              <NewsCard
                v-else
                :item="block.item"
                :variant="block.type === 'compact' ? 'compact' : 'full'"
                :fresh="isFresh(block.item)"
              />
            </template>
            <p
              v-if="filteredNews.length === 0"
              class="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center text-muted"
            >
              {{ emptyNewsLabel }}
            </p>
          </div>
        </template>
      </section>
    </main>

    <Footer />
  </div>
</template>
