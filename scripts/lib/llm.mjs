import { readEnv } from './env.mjs'
import { extractJson } from './summary.mjs'

const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

let llmCalls = 0
let llmCallLimit = 30
let llmLimitAnnounced = false

// 這次執行已經送出的模型請求數。重試與格式退回各算一次
// 回傳: 非負整數
export const llmCallCount = () => llmCalls

// 這次執行的呼叫上限
// 回傳: 正整數
export const llmCallLimitValue = () => llmCallLimit

// 距離上限還能再送幾次。分組要為後面的摘要、今日重點與話題留額度
// 回傳: 非負整數
export const llmCallsRemaining = () => Math.max(0, llmCallLimit - llmCalls)

// 這次執行有沒有因為上限而拒絕呼叫
// 回傳: 是否已達上限
export const llmLimitReached = () => llmLimitAnnounced

// 設定單次執行的呼叫上限，並把計數歸零
// limit: 正整數
// 回傳: 無
export const configureLlmCalls = (limit) => {
  llmCallLimit = limit
  llmCalls = 0
  llmLimitAnnounced = false
}

// 送出前記一筆。達到上限就停下，且不當成暫時性錯誤重試
// 回傳: 無
export const reserveLlmCall = () => {
  if (llmCalls >= llmCallLimit) {
    const error = new Error(`已達單次 LLM 呼叫上限 ${llmCallLimit}`)
    error.code = 'llm-limit'
    if (!llmLimitAnnounced) {
      console.error(`[news] ${error.message}，後續不再呼叫模型`)
      llmLimitAnnounced = true
    }
    throw error
  }
  llmCalls += 1
}

// 這次 HTTP 狀態要不要等一下再試
// status: HTTP 狀態碼
// 回傳: 是否為暫時性錯誤
export const isTransientStatus = (status) => TRANSIENT_STATUS.has(status)

// 連線逾時或暫時斷線
// err: 捕捉到的錯誤
// 回傳: 是否值得重試
const isTransientError = (err) => {
  if (err?.transient) return true
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return true
  if (err?.name === 'TypeError' && /fetch failed/i.test(err?.message ?? '')) return true
  const code = err?.cause?.code || err?.code
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)
}

// 失敗時等待再試。間隔由 delays 決定，最多重試 retries 次
// fn: 接收第幾次嘗試（從 0 起）並回傳結果
// options: retries、delays、wait
// 回傳: fn 的結果
export const withRetry = async (fn, { retries = 3, delays = [1000, 2000, 4000], wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) => {
  let last
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await wait(delays[Math.min(attempt - 1, delays.length - 1)] ?? 4000)
    try {
      return await fn(attempt)
    } catch (err) {
      last = err
      if (!isTransientError(err) || attempt === retries) throw err
    }
  }
  throw last
}

// 送出 JSON 請求
// url: 網址
// headers: 不含金鑰以外的標頭也放這裡，呼叫端負責不要把金鑰寫進日誌
// body: 請求本文
// 回傳: HTTP 回應
const postJson = (url, headers, body) => {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
}

// 取出模型回覆的文字
// provider: openai、anthropic 或 gemini
// data: 回應 JSON
// 回傳: 文字
const readContent = (provider, data) => {
  if (provider === 'openai') return data?.choices?.[0]?.message?.content ?? ''
  if (provider === 'anthropic') {
    const part = (data?.content ?? []).find((item) => item?.type === 'text')
    return part?.text ?? ''
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// 依供應商組出請求。金鑰只放在標頭
// provider: 供應商
// model: 模型名稱
// apiKey: 金鑰
// baseUrl: OpenAI 相容服務的基底網址，可空
// system: 系統提示
// user: 使用者訊息
// maxTokens: 輸出長度上限
// 回傳: { url, headers, body, retryBody }
const requestFor = (provider, model, apiKey, baseUrl, system, user, maxTokens) => {
  if (provider === 'openai') {
    const root = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const body = {
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }
    const retryBody = { ...body }
    delete retryBody.response_format
    return {
      url: `${root}/chat/completions`,
      headers: { authorization: `Bearer ${apiKey}` },
      body,
      retryBody,
    }
  }
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: {
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: user }],
      },
    }
  }
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
        },
      },
    }
  }
  throw new Error('LLM_PROVIDER 只支援 openai、anthropic、gemini')
}

// 把 HTTP 狀態收成可重試的錯誤。不附回應本文
// provider: 供應商
// status: HTTP 狀態碼
// 回傳: Error
const statusError = (provider, status) => {
  const error = new Error(`${provider} 回應 ${status}`)
  error.status = status
  error.transient = isTransientStatus(status)
  return error
}

// 呼叫模型並解析 JSON。429 與暫時性錯誤最多重試三次，間隔遞增
// request: { user, system, maxTokens }
// 回傳: 解析後的物件
export const completeJson = async ({ user, system, maxTokens = 1200 }) => {
  const provider = (readEnv('LLM_PROVIDER') || 'openai').toLowerCase()
  const model = readEnv('LLM_MODEL')
  const apiKey = readEnv('LLM_API_KEY')
  const baseUrl = readEnv('LLM_BASE_URL')
  if (!model) throw new Error('缺少 LLM_MODEL')
  if (!apiKey) throw new Error('缺少 LLM_API_KEY')
  const planned = requestFor(provider, model, apiKey, baseUrl, system, user, maxTokens)
  return withRetry(async (attempt) => {
    if (attempt > 0) console.error(`[news] 模型暫時無法回應，進行第 ${attempt} 次重試`)
    reserveLlmCall()
    let res = await postJson(planned.url, planned.headers, planned.body)
    if (!res.ok && res.status === 400 && planned.retryBody) {
      reserveLlmCall()
      res = await postJson(planned.url, planned.headers, planned.retryBody)
    }
    if (!res.ok) throw statusError(provider, res.status)
    const data = await res.json()
    const content = readContent(provider, data)
    if (!content) throw new Error(`${provider} 沒有回傳文字`)
    return extractJson(content)
  })
}
