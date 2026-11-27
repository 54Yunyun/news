import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalUrl, dedupe, hintFromRssCategory, hintFromUrlPath, metaDescriptionFromHtml, parseFeed, selectByCategory, stripHtml, titleScore, withinAge } from './rss.mjs'

const source = { id: 'demo', name: '示例報', category: 'international' }

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Same Story]]></title>
    <link>https://Example.com/a?utm_source=rss</link>
    <pubDate>Mon, 23 Nov 2026 01:00:00 GMT</pubDate>
    <description><![CDATA[<p>Hello &amp; world</p>]]></description>
  </item>
  <item>
    <title>Same Story</title>
    <link>https://example.com/a/</link>
    <pubDate>Mon, 23 Nov 2026 02:00:00 GMT</pubDate>
    <description>dup</description>
  </item>
  <item>
    <title>Markets open higher</title>
    <link>https://example.com/b</link>
    <pubDate>Mon, 23 Nov 2026 03:00:00 GMT</pubDate>
    <description>short</description>
  </item>
</channel></rss>`

test('去掉 HTML 與實體', () => {
  assert.equal(stripHtml('<p>Hello &amp; world</p>'), 'Hello & world')
})

test('連結去掉追蹤參數', () => {
  assert.equal(canonicalUrl('https://Example.com/a/?utm_source=rss'), 'https://example.com/a')
})

test('解析 RSS 並依連結去重，保留較新的一則', () => {
  const parsed = parseFeed(rss, source)
  assert.equal(parsed[0].snippet, 'Hello & world')
  assert.equal(parsed[0].image, null)
  const items = dedupe(parsed)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'Markets open higher')
  assert.equal(items[1].url, 'https://example.com/a')
  assert.equal(items[1].snippet, 'dup')
  assert.match(items[1].publishedAt, /\+08:00$/)
})

test('同一家的相似標題只留一則，不同媒體先留著', () => {
  const score = titleScore('台股早盤電子權值走揚', '台股早盤電子權值走揚')
  assert.equal(score, 1)
  const items = dedupe([
    { url: 'https://example.com/1', title: '台股早盤電子權值走揚', publishedAt: '2026-11-23T10:00:00+08:00', category: 'finance', source: '甲', snippet: '', id: 'a' },
    { url: 'https://example.com/2', title: '台股早盤電子權值走揚！', publishedAt: '2026-11-23T09:00:00+08:00', category: 'finance', source: '甲', snippet: '', id: 'b' },
    { url: 'https://example.com/3', title: '台股早盤電子權值走揚！', publishedAt: '2026-11-23T09:30:00+08:00', category: 'finance', source: '乙', snippet: '', id: 'c' },
  ])
  assert.deepEqual(items.map((item) => item.id).sort(), ['a', 'c'])
})

test('每個分類最多留 N 則，並去掉過舊的', () => {
  const items = [
    { category: 'tech', publishedAt: '2026-11-23T10:00:00+08:00', url: 'https://example.com/1' },
    { category: 'tech', publishedAt: '2026-11-23T09:00:00+08:00', url: 'https://example.com/2' },
    { category: 'life', publishedAt: '2026-11-23T08:00:00+08:00', url: 'https://example.com/3' },
    { category: 'life', publishedAt: '2026-11-20T08:00:00+08:00', url: 'https://example.com/4' },
  ]
  const fresh = withinAge(items, 36, new Date('2026-11-23T12:00:00+08:00'))
  assert.equal(fresh.length, 3)
  assert.equal(selectByCategory(fresh, 1).length, 2)
})

test('RSS 分類提示含政治', () => {
  assert.equal(hintFromRssCategory('政治'), 'politics')
  assert.equal(hintFromRssCategory('生活'), 'life')
})

test('解析 Atom', () => {
  const atom = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Atom title</title>
      <link href="https://example.com/atom"/>
      <updated>2026-11-23T01:00:00Z</updated>
      <summary>atom summary</summary>
    </entry>
  </feed>`
  const items = parseFeed(atom, source)
  assert.equal(items.length, 1)
  assert.equal(items[0].url, 'https://example.com/atom')
  assert.equal(items[0].snippet, 'atom summary')
  assert.equal(items[0].image, null)
})

test('RSS 圖片依序取 enclosure、thumbnail，太小或標誌就改看下一張', () => {
  const xml = `<?xml version="1.0"?>
  <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
    <item>
      <title>With photo</title>
      <link>https://example.com/photo</link>
      <pubDate>Mon, 23 Nov 2026 01:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example/audio.mp3" type="audio/mpeg"/>
      <media:thumbnail url="https://cdn.example/logo.png" width="800" height="450"/>
      <media:content url="https://cdn.example/story.jpg" medium="image" width="640" height="360"/>
      <description><![CDATA[<img src="https://cdn.example/ignored.jpg" width="800">]]></description>
    </item>
  </channel></rss>`
  const [item] = parseFeed(xml, source)
  assert.equal(item.image, 'https://cdn.example/story.jpg')
  assert.equal(item.imageWidth, 640)
  assert.equal(item.imageHeight, 360)
})

test('解析 Google News Sitemap 並依網址路徑分五類，略過娛樂與體育', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
          xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
          xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
    <url>
      <loc>https://news.nextapple.com/politics/20261127/AAA111</loc>
      <lastmod>2026-11-27T09:50:00+08:00</lastmod>
      <news:news>
        <news:publication_date>2026-11-27T09:50:00+08:00</news:publication_date>
        <news:title><![CDATA[首都選戰倒數]]></news:title>
      </news:news>
      <image:image>
        <image:loc>https://static-cdn.nextapple.tw/prod/2026-11/AAA111/photo_1280.webp</image:loc>
      </image:image>
    </url>
    <url>
      <loc>https://news.nextapple.com/entertainment/20261127/BBB222</loc>
      <news:news>
        <news:publication_date>2026-11-27T09:45:00+08:00</news:publication_date>
        <news:title><![CDATA[娛樂新聞]]></news:title>
      </news:news>
    </url>
    <url>
      <loc>https://news.nextapple.com/aitech/20261127/CCC333</loc>
      <news:news>
        <news:publication_date>2026-11-27T09:40:00+08:00</news:publication_date>
        <news:title><![CDATA[AI 晶片發表]]></news:title>
      </news:news>
    </url>
  </urlset>`
  const nextapple = { id: 'nextapple', name: '壹蘋新聞網', category: 'life', splitByUrlCategory: true }
  const items = parseFeed(xml, nextapple)
  assert.equal(items.length, 2)
  assert.equal(items[0].category, 'politics')
  assert.equal(items[0].feedId, 'nextapple:politics')
  assert.equal(items[0].image, 'https://static-cdn.nextapple.tw/prod/2026-11/AAA111/photo_1280.webp')
  assert.equal(items[1].category, 'tech')
  assert.equal(items[1].feedId, 'nextapple:tech')
  assert.equal(hintFromUrlPath('https://news.nextapple.com/sports/20261127/DDD444'), '')
})

test('從文章頁 HTML 取出 description 或 og:description', () => {
  const html = '<meta content="第一段 &amp; 重點" name="description"><meta property="og:description" content="備用">'
  assert.equal(metaDescriptionFromHtml(html), '第一段 & 重點')
  assert.equal(metaDescriptionFromHtml('<meta property="og:description" content="只有 OG 描述">'), '只有 OG 描述')
})
