# 每日新聞

純前端的新聞與天氣簡報。頁面讀取 `public/data/news.json` 與 `public/data/weather.json`。這兩份檔案由 Node 腳本產生，GitHub Actions 在臺灣時間 07:17、12:17、18:17 各執行一次並部署到 GitHub Pages。刊頭版次由 `generatedAt` 的台北時間決定：05:00–10:59 晨間版、11:00–16:59 午間版、17:00–04:59 晚間版。

標題、摘要與天氣文字都用文字節點顯示，頁面沒有 `v-html`。

## 專案結構

```
news/
├── .env.example
├── .github/workflows/daily-briefing.yml
├── index.html
├── package.json
├── vite.config.js
├── public/data/
│   ├── news.json
│   └── weather.json
├── scripts/
│   ├── fetch-all.mjs          # npm run fetch
│   ├── fetch-news.mjs
│   ├── fetch-weather.mjs
│   ├── sources.json           # RSS 清單與則數
│   ├── weather.config.json    # 縣市、行政區、提醒門檻
│   └── lib/
└── src/                       # Vue 畫面
```

本機看畫面：

```bash
npm install
npm run dev
```

## 資料格式

新聞改成一則事件一篇。多家報導同一件事時合成一則；只有一家時仍是單篇摘要。`generatedAt` 與 `updatedAt` 寫入同一個時間，刊頭的「更新時間」讀 `generatedAt`。

`public/data/news.json`

| 欄位 | 說明 |
| --- | --- |
| `generatedAt` | 這份檔案產生的時間，ISO 8601，`+08:00` |
| `updatedAt` | 與 `generatedAt` 相同 |
| `previousGeneratedAt` | 上一份檔案的 `generatedAt`。沒有上一份時省略。畫面用它判斷「新」 |
| `todayBrief` | 三句今日重點。由模型依事件標題整理。沒有就不顯示 |
| `items[].id` | 事件 id。各來源連結排序後取雜湊，同一組連結跨次更新不變 |
| `items[].category` | `international`、`politics`、`finance`、`tech`、`sports`、`gaming`、`life`。由模型依內容判斷 |
| `items[].publishedAt` | 這則事件最晚一篇的時間 |
| `items[].firstSeenAt` | 這個事件第一次出現的時間。來源連結組合沒變時沿用上一份；舊檔沒有這個欄位時，改用上一份的 `generatedAt` |
| `items[].topicId` | 同一個大話題的事件共用。沒有串到其他事件時省略 |
| `items[].topicName` | 話題名稱，跟 `topicId` 一起出現 |
| `items[].sourceCount` | 去重後的媒體家數 |
| `items[].title` | 繁體中文標題。多家為整合標題 |
| `items[].highlights` | 單篇三點；多家三到四點 |
| `items[].commonFacts` | 只有多家會寫。各家都提到的事實，沒有就省略 |
| `items[].image` | 事件封面。`{ url, sourceName, width?, height? }`，沒有圖則為 `null`。只存網址，不下載圖片檔 |
| `items[].sources[]` | `name`、`title`（原標題）、`url`、`publishedAt`、`image`（該篇圖片網址，沒有則為 `null`）。多家另有 `angle` 一句話 |

圖片版權屬原媒體，本站僅引用原站網址並標示來源。解析 RSS 時依序取 `enclosure`（type 為 image）、`media:thumbnail`、`media:content`、描述裡的第一張圖。都沒有、而且該篇被選為事件封面時，才讀文章頁的 `og:image`（逾時 5 秒，失敗略過，每次最多 40 頁）。logo、icon、1×1 追蹤圖，以及寬度小於 300 的圖不會採用。同一事件從各來源裡挑第一個有圖的，篇數較多的來源優先，其次才看媒體權重。畫面上載入失敗會收起圖片，改回沒有圖的版面。

`public/data/weather.json` 以縣市代碼當鍵，例如 `cities.taipei`。每個縣市的欄位與先前單縣市檔相同：`updatedAt`、`location`、`current`（`temp`、`condition`、`conditionCode`、`high`、`low`、`rainProb`）、`reminder`、`forecast[]`（`date`、`label`、`condition`、`conditionCode`、`high`、`low`、`rainProb`）。另外有 `order` 與 `names`，給畫面的縣市選單用。氣溫是攝氏整數。整份超過 150KB 時改寫成索引，各縣市放到 `public/data/weather/<代碼>.json`，選擇縣市時才載入。

另有兩段，缺資料時整段不顯示：

| 欄位 | 來源 | 說明 |
| --- | --- | --- |
| `hourly[]` | 同一個鄉鎮預報 `F-D0047-061` 的逐時溫度 `T`，以及 `PoP3h` / `PoP6h` / `PoP12h` | 未來 12 小時。`time`、`label`（如 `11時`）、`temp`、`rainProb`。降雨機率是涵蓋該小時的那一段，不是逐時獨立觀測 |
| `sun` | 日出日沒時刻 `A-B0062-001`，查詢參數 `CountyName` 與當天 `Date` | `date`、`sunrise`、`sunset`，時間是 `HH:mm`。對應氣象署的 `Date`、`SunRiseTime`、`SunSetTime`。沒帶 `Date` 時資料集預設只回舊年份，畫面上就不會有日出日落 |

`conditionCode`：`sunny`、`partly-cloudy`、`cloudy`、`rain`、`thunderstorm`、`fog`。

## 取得金鑰

模型：

| 供應商 | `LLM_PROVIDER` | 金鑰位置 |
| --- | --- | --- |
| OpenAI，或其他 OpenAI 相容服務 | `openai` | [OpenAI API keys](https://platform.openai.com/api-keys)。相容服務再填 `LLM_BASE_URL`，例如 `https://api.groq.com/openai/v1` |
| Anthropic | `anthropic` | [Anthropic console](https://console.anthropic.com/settings/keys) |
| Gemini | `gemini` | [Google AI Studio](https://aistudio.google.com/apikey) |

`LLM_MODEL` 填該供應商的模型名稱，例如 `gpt-4o-mini`。

中央氣象署：

1. 開啟 [氣象資料開放平臺](https://opendata.cwa.gov.tw/) 並註冊。
2. 登入後到會員專區複製授權碼，填入 `CWA_API_KEY`。
3. 授權碼只放在 `.env` 或 GitHub Secrets，不要寫進程式或提交到 git。

## 本機執行

```bash
cp .env.example .env
# 編輯 .env 後
npm run fetch
```

`npm run fetch` 會先跑新聞、再跑天氣。其中一支失敗時，另一支仍會執行。失敗的那一份不會覆寫，畫面上繼續用前一次成功的檔案。

也可以分開跑：`npm run fetch:news`、`npm run fetch:weather`。

還沒有金鑰時，腳本會停下，`public/data` 維持原檔。

## GitHub

倉庫要先推上去。Settings → Secrets and variables → Actions：

Secrets：

- `LLM_API_KEY`
- `CWA_API_KEY`

Variables：

- `LLM_PROVIDER`（可省略，腳本預設 `openai`）
- `LLM_MODEL`
- `LLM_BASE_URL`（只有相容服務需要）

Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。

臺灣時間 07:17、12:17、18:17 會跑 `.github/workflows/daily-briefing.yml`（cron 為 UTC `17 23,4,10 * * *`），也可以在 Actions 頁面手動執行。抓取成功後會先寫回這個分支，再建置並部署到 GitHub Pages，避免部署遇到 API 異常時連帶遺失已抓好的資料；抓取失敗則沿用現有 JSON 建置並部署。若分支有保護規則擋住機器人推送，部署仍會完成，但寫回那一步會失敗，需要允許 `github-actions[bot]` 寫入。

選 GitHub Pages 是因為部署用倉庫自帶的 `GITHUB_TOKEN`，不必再申請 Cloudflare 帳號或另外放一組部署金鑰。

## 新增 RSS

編輯 `scripts/sources.json`。每一筆：

```json
{ "id": "bbc-world", "name": "BBC News", "category": "international", "url": "https://feeds.bbci.co.uk/news/world/rss.xml" }
```

`category` 只能是 `international`、`politics`、`finance`、`tech`、`sports`、`gaming`、`life`，它只是提示。寫進 `news.json` 的分類由模型依內容決定。`perCategory` 是每個分類最多幾個事件，預設 8。`perSource` 是每個訂閱源最多幾則，預設 12。`batchSize` 是摘要每批幾個事件，預設 6。`groupBatchSize` 是分組每批幾則標題，預設 50，相鄰批次重疊 `groupOverlap` 則（預設 8）。`maxSources` 預設 8，合併後超過這個家數就退回不合併。`maxAgeHours` 預設 36。`maxLlmCalls` 是單次執行的模型呼叫上限，預設 60。重試與格式退回各算一次。分組會留下額度給摘要、今日重點與話題。達到上限後不再呼叫。已經摘要完的事件用新結果；還沒處理的沿用上一份摘要，上一份還沒被取代的事件也留在檔案裡。日誌會逐則寫出「因呼叫上限沿用舊摘要」，並印出這次的呼叫次數。

聯合報總覽含多種題材。該筆加上 `"splitByRssCategory": true` 後，會依 RSS 的分類先分成七類提示，每一類各自套用 `perSource`。壹蘋新聞網沒有官方 RSS，改讀官方新聞 sitemap（`https://news.nextapple.com/api/xml/site-map/news`），加上 `"splitByUrlCategory": true` 依網址路徑分成七類提示並略過娛樂、醫美等非日常範圍。這些提示仍不是最終分類。

目前會抓的來源：BBC、NHK、TechCrunch、中央社（國際、財經、科技、生活、政治、社會、運動）、ETtoday（要聞、財經、國際、社會、生活、健康、科技、體育）、自由時報（國際、財經、生活、社會、政治、體育）、聯合報（總覽、運動）、Yahoo 奇摩（政治、社會、財經、科技、綜合）、公視、壹蘋新聞網、巴哈姆特 GNN、4Gamers、遊戲角落。NHK World 英文 RSS 目前回 404，所以用 [NHK 目前的新聞 RSS](https://news.web.nhk/n-data/conf/na/rss/cat0.xml)。

實測後沒放進清單的網址：

- ETtoday 官網 `https://www.ettoday.net/rss/rss.xml` 與 `rss01.xml` 到 `rss20.xml` 回的是 HTML。`feeds.feedburner.com/ettoday/life`、`consumer` 為 404。即時總覽 `ettoday/realtime` 可以解析，但和分類訂閱重複，所以沒有另加。
- 自由時報 `technology.xml`、`3c.ltn.com.tw/rss.xml`、`ec.ltn.com.tw/rss.xml` 無法當 RSS 用。體育、娛樂、即時總覽可以解析，總覽與分類重複，體育與娛樂不在這四類的日常範圍，所以沒加。
- 聯合報 `udn.com/rssfeed/news/2/...` 有項目殼但標題與連結是空的。改用 `https://udn.com/news/rssfeed/index`。
- Yahoo `https://tw.news.yahoo.com/rss/world` 沒有項目。總覽與分類重複，所以只用分類訂閱。
- 公視 `news.pts.org.tw/rss/newsfeed.xml`、`rss.xml` 為 404，`about.pts.org.tw` 為 502。改用 Atom：`https://news.pts.org.tw/xml/newsfeed.xml`。
- 中央社 `cna.com.tw/rss/aall.xml` 為 404。沿用 FeedBurner。

腳本讀標題、描述片段（最多 280 字）、連結、發布時間與圖片網址，不抓全文，也不下載圖片檔。描述在送給模型前會去掉 HTML。封面若 RSS 沒有可用的圖，才會讀該篇文章頁的 `og:image`。

Yahoo 這類入口若電頭、`source` 標籤、標題結尾或連結網域看得出原媒體，`sources[].name` 記原媒體。同一家標題極像時只留一篇，優先留該媒體自己的連結。認不出原媒體時仍標成 Yahoo奇摩新聞。

分組流程：

1. 近 36 小時的標題分批交給模型，回傳 `{"groups":[["id","id"],["id"]]}`。
2. 一批裡不認識或重複的 id 會略過，其餘組合保留。整批不是陣列，或呼叫失敗時，才把那一批改成每篇一組。
3. 各批完成後，把每組最新標題再送一輪合併檢查。合併後超過 `maxSources` 家就退回，並寫進日誌。
4. 讀取上一份 `news.json`。來源連結組合相同的事件沿用標題、重點、`commonFacts`、各家一句話與 `firstSeenAt`，不重新呼叫模型。連結有增減的事件才重新摘要，並把 `firstSeenAt` 記成這次的 `generatedAt`。
5. 兩家以上的新事件產出整合標題、三到四點、`commonFacts` 與每家一句話。一家的新事件維持單篇摘要。
6. 事件確定後，用全部標題整理三句 `todayBrief`，再檢查哪些事件屬於同一個大話題，寫上共同的 `topicId` 與 `topicName`。
7. 提示詞會寫明這些文字只是待整理的資料，不是指令。
8. 429 或暫時性錯誤會等 1 秒、2 秒、4 秒後重試，最多三次。仍失敗才走該步驟原本的退回。
9. 整個檔案組不起來時，不覆寫 `news.json`。

單一 RSS 失敗會略過並在日誌留下來源名稱。

## 天氣資料集

使用中央氣象署開放資料的鄉鎮未來 3 天預報。22 個縣市（6 直轄市、3 市、13 縣）各用未來 3 天那一支，代碼對照產品說明 [F-D0047-001 至 093](https://opendata.cwa.gov.tw/opendatadoc/Forecast/F-D0047-001_093.pdf) 與[政府資料開放平臺的臺北市資料集](https://data.gov.tw/dataset/9293)。瀏覽器不呼叫氣象署，授權碼只在這個腳本與 GitHub Secrets。

每個縣市取市政府或縣政府所在的行政區，清單在 `scripts/weather.config.json`。代表點是該行政區公所，不是市政府門牌本身。臺北市取信義區。

介面是 `https://opendata.cwa.gov.tw/api/v1/rest/datastore/<代碼>`。授權碼放在 `Authorization` 查詢參數，日誌只記狀態碼、縣市與資料集代碼。預報以 `locationName` 帶代表行政區，日出日落向 `A-B0062-001` 帶 `CountyName` 與當天 `Date`。兩次呼叫之間預設停 400 毫秒。

氣象資料開放平臺的會員授權碼，每日約 20,000 次、流量約 2GB（見[授權碼申請頁](https://opendata.cwa.gov.tw/user/authkey)的額度說明；使用手冊 v1.3 沒有另外寫每分鐘上限）。一天三次、每次 22 個縣市的預報加日出日落，是 132 次，低於這個額度。單一次數市失敗只留該縣市的上一份，其他縣市照常更新。

| 縣市 | 代表行政區 | 代碼 | 縣市 | 代表行政區 | 代碼 |
| --- | --- | --- | --- | --- | --- |
| 基隆市 | 中正區 | F-D0047-049 | 嘉義市 | 東區 | F-D0047-057 |
| 臺北市 | 信義區 | F-D0047-061 | 臺南市 | 安平區 | F-D0047-077 |
| 新北市 | 板橋區 | F-D0047-069 | 高雄市 | 苓雅區 | F-D0047-065 |
| 桃園市 | 桃園區 | F-D0047-005 | 屏東縣 | 屏東市 | F-D0047-033 |
| 新竹縣 | 竹北市 | F-D0047-009 | 宜蘭縣 | 宜蘭市 | F-D0047-001 |
| 新竹市 | 北區 | F-D0047-053 | 花蓮縣 | 花蓮市 | F-D0047-041 |
| 苗栗縣 | 苗栗市 | F-D0047-013 | 臺東縣 | 臺東市 | F-D0047-037 |
| 臺中市 | 西屯區 | F-D0047-073 | 澎湖縣 | 馬公市 | F-D0047-045 |
| 彰化縣 | 彰化市 | F-D0047-017 | 金門縣 | 金城鎮 | F-D0047-085 |
| 南投縣 | 南投市 | F-D0047-021 | 連江縣 | 南竿鄉 | F-D0047-081 |
| 雲林縣 | 斗六市 | F-D0047-025 | 嘉義縣 | 太保市 | F-D0047-029 |

目前氣溫取最接近現在的逐時溫度，高低溫與降雨機率由當天的資料彙總。未來三天從今天起算。未來 12 小時的氣溫用同一份資料的逐時溫度，每個小時的降雨機率用涵蓋該小時的 3 小時、6 小時或 12 小時機率。日出日落失敗時仍寫入該縣市的預報；上一份有日出日落就留著。

出門提醒不呼叫模型。門檻在 `reminders`：降雨機率達到 `umbrella`（50）提醒帶傘，達到 `maybeRain`（30）提醒摺傘，低溫低於或等於 `cold`（18）提醒保暖，日夜溫差達到 `gap`（8）提醒加衣，高溫達到 `hot`（32）提醒補水。明天的降雨機率超過 `tomorrowRain`（60）時，同一句裡會加上「明天有雨」。

單一縣市連線失敗或回應無法整理時，該縣市留上一份，其餘照常寫入。全部縣市都沒有可寫的資料時，不覆寫 `weather.json`。

## 模型費用怎麼估

每次執行的呼叫分成三段：分組、合併檢查、摘要。摘要只處理每個分類最多 `perCategory` 個事件，而且來源連結組合沒變的事件不計入。單次呼叫達到 `maxLlmCalls` 就停止。一天會跑三次，所以分組與合併檢查大約是下面這個一天一次估法的三倍；摘要則看有多少事件是新的或來源有變。

```
分組則數 ≈ 來源數 × perSource，再扣掉過舊與同一家重複
分組請求數 ≈ ceil(分組則數 / (groupBatchSize - groupOverlap))
摘要事件數 ≤ perCategory × 5
每月輸入 tokens ≈ 30 ×（分組標題 + 一輪代表標題 + 摘要用的標題與 280 字片段）
每月輸出 tokens ≈ 30 ×（分組 id 清單 + 每則事件的標題、重點與各家一句話）
每月費用 ≈ 每月輸入 tokens / 1,000,000 × 輸入單價
         + 每月輸出 tokens / 1,000,000 × 輸出單價
```

以目前來源、分組約 150 則標題、摘要約 32 個事件來估，一個月大約是輸入 90 萬 tokens、輸出 24 萬 tokens。單價請改成供應商當下的價格。若輸入 USD 0.15 / 百萬 tokens、輸出 USD 0.60 / 百萬 tokens，這個量大約是 USD 0.3。把 `perSource`、`perCategory` 或 `groupBatchSize` 調小，費用會跟著下降。
