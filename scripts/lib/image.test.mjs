import assert from 'node:assert/strict'
import test from 'node:test'
import { attachEventImages, hasDarkSideBars, imageFromNode, ogImageFromHtml, usableImage } from './image.mjs'

const page = 'https://example.com/story'
const noBlackBars = async () => false

test('圖片順序是 enclosure、thumbnail、content，再來才是描述裡的 img', () => {
  const picked = imageFromNode({
    enclosure: { '@_url': 'https://cdn.example/logo.png', '@_type': 'image/png', '@_width': '800' },
    'media:thumbnail': { '@_url': 'https://cdn.example/wide.jpg', '@_width': '640', '@_height': '360' },
    description: '<img src="https://cdn.example/from-html.jpg" width="800" height="450">',
  }, page)
  assert.equal(picked.url, 'https://cdn.example/wide.jpg')
  assert.equal(picked.width, 640)
  assert.equal(picked.height, 360)
})

test('太小的圖與標誌會跳過，改用下一張', () => {
  const picked = imageFromNode({
    'media:thumbnail': [
      { '@_url': 'https://cdn.example/pixel.gif', '@_width': '1', '@_height': '1' },
      { '@_url': 'https://cdn.example/small.jpg', '@_width': '299', '@_height': '200' },
    ],
    'media:content': { '@_url': 'https://cdn.example/clip.mp4', '@_type': 'video/mp4', '@_width': '1280' },
    description: '<p><img src="/photos/ok.jpg" width="640" height="360"></p>',
  }, page)
  assert.equal(picked.url, 'https://example.com/photos/ok.jpg')
})

test('寬度剛好 400 可以留，寬度不足 400、含禁用字或寬高比不合則略過', () => {
  assert.equal(usableImage({ url: 'https://cdn.example/a.jpg', width: 400, height: 300 }).width, 400)
  assert.equal(usableImage({ url: 'https://cdn.example/a.jpg', width: 399, height: 300 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/a.jpg?w=300' }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/hqdefault.jpg', width: 800, height: 600 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/site-placeholder.png', width: 800, height: 600 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/brandLogo.jpg', width: 800, height: 600 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/appIcon.png', width: 800, height: 600 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/banner.jpg', width: 1200, height: 400 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/tall.jpg', width: 600, height: 900 }), null)
  assert.equal(usableImage({ url: 'https://cdn.example/edge-wide.jpg', width: 1200, height: 500 }).width, 1200)
  assert.equal(usableImage({ url: 'https://cdn.example/edge-tall.jpg', width: 800, height: 1000 }).width, 800)
  assert.equal(usableImage({ url: 'https://imgcdn.cna.com.tw/www/images/pic_fb.jpg', width: 1024 }), null)
  assert.equal(usableImage({ url: 'https://udn.com/static/img/UDN_BABY.png', width: 1000 }), null)
})

test('og:image 會補上寬高，太窄的不採用', () => {
  const html = `
    <meta property="og:image" content="/og.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
  `
  const image = ogImageFromHtml(html, page)
  assert.equal(image.url, 'https://example.com/og.jpg')
  assert.equal(image.width, 1200)
  const narrow = ogImageFromHtml('<meta name="og:image" content="https://cdn.example/n.jpg"><meta property="og:image:width" content="120">', page)
  assert.equal(narrow, null)
})

const source = (name, url) => ({
  name,
  title: name,
  url,
  publishedAt: '2026-11-26T10:00:00+08:00',
})

test('封面優先採用篇數較多的來源，其次才看媒體權重', async () => {
  const event = {
    id: 'e1',
    sourceCount: 2,
    sources: [source('中央社', 'https://cna.example/1'), source('ETtoday', 'https://ett.example/1')],
  }
  const draftsByUrl = new Map([
    ['https://cna.example/1', { image: 'https://img.example/cna.jpg', imageWidth: 800, imageHeight: 450 }],
    ['https://ett.example/1', { image: 'https://img.example/ett.jpg', imageWidth: 800, imageHeight: 450 }],
  ])
  const membersByEvent = new Map([[
    'e1',
    [
      { source: 'ETtoday', url: 'https://ett.example/1' },
      { source: 'ETtoday', url: 'https://ett.example/2' },
      { source: '中央社', url: 'https://cna.example/1' },
    ],
  ]])
  const stats = await attachEventImages([event], {
    draftsByUrl,
    membersByEvent,
    checkBlackBars: noBlackBars,
    fetchPage: async () => { throw new Error('不該抓文章頁') },
  })
  assert.equal(event.image.url, 'https://img.example/ett.jpg')
  assert.equal(event.image.sourceName, 'ETtoday')
  assert.equal(event.sources[0].image, 'https://img.example/cna.jpg')
  assert.equal(stats.fetched, 0)
})

test('篇數相同時，權重較高的來源當封面', async () => {
  const event = {
    id: 'e2',
    sourceCount: 2,
    sources: [source('ETtoday', 'https://ett.example/1'), source('中央社', 'https://cna.example/1')],
  }
  const draftsByUrl = new Map([
    ['https://cna.example/1', { image: 'https://img.example/cna.jpg', imageWidth: 640 }],
    ['https://ett.example/1', { image: 'https://img.example/ett.jpg', imageWidth: 640 }],
  ])
  await attachEventImages([event], { draftsByUrl, membersByEvent: new Map(), checkBlackBars: noBlackBars })
  assert.equal(event.image.sourceName, '中央社')
})

test('沒有 RSS 圖時，先抓各事件的第一候選，失敗才換下一家', async () => {
  const first = {
    id: 'big',
    sourceCount: 5,
    sources: [source('中央社', 'https://cna.example/a'), source('ETtoday', 'https://ett.example/a')],
  }
  const second = {
    id: 'small',
    sourceCount: 1,
    sources: [source('自由時報', 'https://ltn.example/b')],
  }
  const calls = []
  await attachEventImages([second, first], {
    draftsByUrl: new Map(),
    membersByEvent: new Map(),
    checkBlackBars: noBlackBars,
    limit: 2,
    fetchPage: async (url) => {
      calls.push(url)
      return null
    },
  })
  assert.deepEqual(calls, ['https://cna.example/a', 'https://ltn.example/b'])
  assert.equal(first.image, null)
  assert.equal(first.sources[0].image, null)
  assert.equal(second.sources[0].image, null)
})

test('文章頁抓到圖就寫進該來源與事件，沒抓到的來源維持 null', async () => {
  const event = {
    id: 'e3',
    sourceCount: 1,
    sources: [source('公視', 'https://pts.example/1')],
  }
  const stats = await attachEventImages([event], {
    checkBlackBars: noBlackBars,
    fetchPage: async () => ({ url: 'https://img.example/og.jpg', width: 1200, height: 675 }),
  })
  assert.equal(event.sources[0].image, 'https://img.example/og.jpg')
  assert.deepEqual(event.image, {
    url: 'https://img.example/og.jpg',
    sourceName: '公視',
    width: 1200,
    height: 675,
  })
  assert.equal(stats.withImage, 1)
  assert.equal(stats.fetched, 1)
})

test('台灣媒體優先於國外媒體；僅國外有 RSS 圖時仍先抓台灣文章頁，抓不到才退回國外', async () => {
  const event = {
    id: 'e4',
    sourceCount: 2,
    sources: [source('BBC News', 'https://bbc.example/1'), source('聯合報', 'https://udn.example/1')],
  }
  const draftsByUrl = new Map([
    ['https://bbc.example/1', { image: 'https://img.example/bbc.jpg', imageWidth: 1200, imageHeight: 675 }],
  ])
  const calls = []
  await attachEventImages([event], {
    draftsByUrl,
    checkBlackBars: noBlackBars,
    fetchPage: async (url) => {
      calls.push(url)
      return { url: 'https://img.example/udn.jpg', width: 1000, height: 660 }
    },
  })
  assert.deepEqual(calls, ['https://udn.example/1'])
  assert.equal(event.image.sourceName, '聯合報')
  assert.equal(event.image.url, 'https://img.example/udn.jpg')

  const fallbackEvent = {
    id: 'e5',
    sourceCount: 2,
    sources: [source('NHK', 'https://nhk.example/1'), source('自由時報', 'https://ltn.example/1')],
  }
  const fallbackDrafts = new Map([
    ['https://nhk.example/1', { image: 'https://img.example/nhk.jpg', imageWidth: 1200, imageHeight: 675 }],
  ])
  await attachEventImages([fallbackEvent], {
    draftsByUrl: fallbackDrafts,
    checkBlackBars: noBlackBars,
    fetchPage: async () => ({ url: 'https://img.example/default-thumb.jpg', width: 1200, height: 675 }),
  })
  assert.equal(fallbackEvent.image.sourceName, 'NHK')
  assert.equal(fallbackEvent.image.url, 'https://img.example/nhk.jpg')
})

test('所有來源的圖都不合格時，事件 image 設為 null', async () => {
  const event = {
    id: 'e6',
    sourceCount: 2,
    sources: [source('中央社', 'https://cna.example/1'), source('BBC News', 'https://bbc.example/1')],
  }
  await attachEventImages([event], {
    checkBlackBars: noBlackBars,
    fetchPage: async (url) => (
      url.includes('cna')
        ? { url: 'https://img.example/hqdefault.jpg', width: 800, height: 600 }
        : { url: 'https://img.example/narrow.jpg', width: 350, height: 250 }
    ),
  })
  assert.equal(event.image, null)
})

test('Google News Sitemap 的 image:image 可作為封面且壹蘋視為台灣媒體', async () => {
  const picked = imageFromNode({
    'image:image': { 'image:loc': 'https://static-cdn.nextapple.tw/prod/2026-11/AAA/photo_1280.webp' },
  }, 'https://news.nextapple.com/politics/20261127/AAA')
  assert.equal(picked.url, 'https://static-cdn.nextapple.tw/prod/2026-11/AAA/photo_1280.webp')

  const event = {
    id: 'e7',
    sourceCount: 2,
    sources: [source('BBC News', 'https://bbc.example/7'), source('壹蘋新聞網', 'https://news.nextapple.com/international/20261127/7')],
  }
  const draftsByUrl = new Map([
    ['https://bbc.example/7', { image: 'https://img.example/bbc.jpg', imageWidth: 1200, imageHeight: 675 }],
    ['https://news.nextapple.com/international/20261127/7', { image: picked.url }],
  ])
  await attachEventImages([event], { draftsByUrl, checkBlackBars: noBlackBars })
  assert.equal(event.image.sourceName, '壹蘋新聞網')
  assert.equal(event.image.url, picked.url)
})

// 產生測試用的 RGB 像素陣列，可指定左右邊緣與中間亮度
// options: width、height、side（左右亮度）、center（中央亮度）
// 回傳: Uint8Array
const makeRgb = ({ width = 100, height = 60, side = 0, center = 180 }) => {
  const buf = new Uint8Array(width * height * 3)
  const bar = Math.floor(width * 0.15)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < bar || x >= width - bar ? side : center
      const idx = (y * width + x) * 3
      buf[idx] = value
      buf[idx + 1] = value
      buf[idx + 2] = value
    }
  }
  return buf
}

test('左右明顯黑邊會被偵測出來，正常照片與全暗夜景不會誤判', () => {
  assert.equal(hasDarkSideBars(makeRgb({ side: 4, center: 160 }), 100, 60, 3), true)
  assert.equal(hasDarkSideBars(makeRgb({ side: 120, center: 160 }), 100, 60, 3), false)
  assert.equal(hasDarkSideBars(makeRgb({ side: 10, center: 14 }), 100, 60, 3), false)
})

test('偵測到首選來源有左右黑邊時，自動改用下一家來源的封面圖', async () => {
  const event = {
    id: 'e8',
    sourceCount: 2,
    sources: [source('中央社', 'https://cna.example/8'), source('聯合報', 'https://udn.example/8')],
  }
  const draftsByUrl = new Map([
    ['https://cna.example/8', { image: 'https://img.example/blackbars.jpg', imageWidth: 1200, imageHeight: 675 }],
    ['https://udn.example/8', { image: 'https://img.example/clean.jpg', imageWidth: 1200, imageHeight: 675 }],
  ])
  const stats = await attachEventImages([event], {
    draftsByUrl,
    checkBlackBars: async (url) => url.includes('blackbars'),
  })
  assert.equal(event.image.sourceName, '聯合報')
  assert.equal(event.image.url, 'https://img.example/clean.jpg')
  assert.equal(stats.skippedDarkBars, 1)
})
