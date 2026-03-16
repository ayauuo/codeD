import { ref, computed, shallowRef, nextTick } from 'vue'
import QRCode from 'qrcode'
import type { Template, ScreenName, FilterId, TemplateSlot } from '@/types/photobooth'
import { callHost } from './useHost'

const isOfflineMode = () => {
  const v = import.meta.env.VITE_OFFLINE_MODE
  return v === '1' || String(v).toLowerCase() === 'true'
}

const TEMPLATES: Template[] = [
  {
    id: 'bk01',
    preview: '/assets/templates/chooselayout/bk01.png',
    shotCount: 4,
    sizeKey: '4x6',
    captureW: 544,
    captureH: 471,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '544/471',
    width: 1205,
    height: 1795,
    slots: [
      { x: 43, y: 244, w: 544, h: 471 },
      { x: 42, y: 1225, w: 544, h: 471 },
      { x: 625, y: 244, w: 544, h: 471 },
      { x: 623, y: 1061, w: 544, h: 471 },
    ],
    // 換新框圖時設 displayW / displayH 為新圖的實際寬高（px），預覽與 video 會用這個尺寸
    shootLayout: { layoutKey: 'bk01', captureW: 544, captureH: 471, displayW: 988, displayH: 724 },
  },
  {
    id: 'bk02',
    preview: '/assets/templates/chooselayout/bk02.png',
    shotCount: 4,
    sizeKey: '4x6',
    captureW: 547,
    captureH: 405,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '547/405',
    width: 1205,
    height: 1795,
    slots: [
      { x: 39, y: 667, w: 547, h: 405 },
      { x: 39, y: 1158, w: 547, h: 405 },
      { x: 662, y: 667, w: 547, h: 405 },
      { x: 662, y: 1158, w: 547, h: 405 },
    ],
    shootLayout: { layoutKey: 'bk02', captureW: 547, captureH: 405 },
  },
  {
    id: 'bk03',
    preview: '/assets/templates/chooselayout/bk03.png',
    shotCount: 2,
    sizeKey: '4x6',
    captureW: 524,
    captureH: 502,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '524/502',
    width: 1205,
    height: 1795,
    slots: [
      { x: 56, y: 1004, w: 524, h: 502 },
      { x: 637, y: 590, w: 524, h: 502 },
    ],
    shootLayout: { layoutKey: 'bk03', captureW: 524, captureH: 502 },
  },
  {
    id: 'bk04',
    preview: '/assets/templates/chooselayout/bk04.png',
    shotCount: 4,
    sizeKey: '4x6',
    captureW: 529,
    captureH: 400,
    stageSize: { maxWidth: '1000px', maxHeight: 'calc(100vh - 200px)' },
    frameAspectRatio: '529/400',
    width: 1205,
    height: 1795,
    slots: [
      { x: 54, y: 761, w: 529, h: 400 },
      { x: 632, y: 761, w: 529, h: 400 },
      { x: 54, y: 1290, w: 529, h: 400 },
      { x: 632, y: 1290, w: 529, h: 400 },
    ],
    shootLayout: { layoutKey: 'bk04', captureW: 529, captureH: 400 },
  },
]

// 單例狀態：所有元件共用同一份，測試面板的切換才會生效
const currentScreen = ref<ScreenName>('idle')
const selectedTemplate = shallowRef<Template | null>(null)
const loading = ref(false)
const captureResults = ref<string[]>([])
const finalFilePath = ref<string | null>(null)
const finalPreviewUrl = ref<string>('')
const qrImageUrl = ref<string>('')
const qrText = ref<string>('')
const autoPrint = ref(false)
const selectedFilter = ref<FilterId | null>(null)
/** 倒數拍攝過程錄下的影片 blob，合成後上傳並在 QR 頁提供下載 */
const captureVideoBlob = ref<Blob | null>(null)
const finalVideoUrl = ref<string>('')
/** 是否為測試模式（使用測試功能時設定，記錄資料會標記為測試資料） */
const isTestSession = ref(false)
const templates = computed(() => TEMPLATES)

/** 結果畫面要顯示的圖：有合成圖用合成圖，否則依 env 顯示版型占位圖（左側大圖） */
const resultDisplayUrl = computed(() => {
  if (finalPreviewUrl.value) return finalPreviewUrl.value
  const showPlaceholder = import.meta.env.VITE_RESULT_SHOW_TEMPLATE_PLACEHOLDER
  if (showPlaceholder === '1' || showPlaceholder === 'true') {
    const tpl = selectedTemplate.value
    const id = tpl?.id ?? 'bk01'
    return `/assets/templates/QRcodePage/${id}.png`
  }
  return ''
})

/** 占位時顯示的 QR 圖與文字（尚無合成圖時用，非同步產生；無網路版不產生） */
const placeholderQrImageUrl = ref<string>('')
const PLACEHOLDER_QR_TEXT = 'https://example.com/download'
if (!isOfflineMode()) {
  QRCode.toDataURL(PLACEHOLDER_QR_TEXT, { width: 600, margin: 2 })
    .then((url: string) => { placeholderQrImageUrl.value = url })
    .catch(() => {})
}

/** 無網路版時不顯示 QR（結果頁隱藏 QR 區塊） */
const showQrCode = computed(() => !isOfflineMode())

/** 結果畫面要顯示的 QR 圖：有合成圖用真實 QR，否則占位時用預設 QR；無網路版一律不顯示 */
const qrDisplayUrl = computed(() => {
  if (isOfflineMode()) return ''
  if (finalPreviewUrl.value) return qrImageUrl.value
  const showPlaceholder = import.meta.env.VITE_RESULT_SHOW_TEMPLATE_PLACEHOLDER
  if (showPlaceholder === '1' || showPlaceholder === 'true') return placeholderQrImageUrl.value
  return ''
})

/** 結果畫面要顯示的 QR 文字：有合成圖用真實網址，否則占位時用預設網址；無網路版一律不顯示 */
const qrDisplayText = computed(() => {
  if (isOfflineMode()) return ''
  if (finalPreviewUrl.value) return qrText.value
  const showPlaceholder = import.meta.env.VITE_RESULT_SHOW_TEMPLATE_PLACEHOLDER
  if (showPlaceholder === '1' || showPlaceholder === 'true') return PLACEHOLDER_QR_TEXT
  return ''
})

const TEST_IMAGE_BASE = '/assets/templates/test'
async function setCaptureResultsFromTestImages() {
  // 標記為測試模式
  isTestSession.value = true
  const tplId = selectedTemplate.value?.id ?? 'bk01'
  try {
    const res = await callHost('load_test_captures', { templateId: tplId }) as { urls?: string[] }
    if (Array.isArray(res.urls) && res.urls.length > 0) {
      captureResults.value = res.urls
      return
    }
  } catch {
    // 無測試存檔時用預設測試圖
  }
  const tpl = selectedTemplate.value
  const n = tpl?.shotCount ?? 4
  captureResults.value = Array.from({ length: n }, (_, i) => `${TEST_IMAGE_BASE}/test${i}.jpg`)
}

export function usePhotobooth() {

  const setLoading = (show: boolean) => {
    loading.value = show
  }

  function showScreen(name: ScreenName) {
    // #region agent log
    const prev = currentScreen.value
    try {
      const win = typeof window !== 'undefined' ? (window as unknown as { __logPhotobooth?: (p: unknown) => void }) : null
      if (win?.__logPhotobooth) win.__logPhotobooth({ showScreen: name, prev })
    } catch { /* noop */ }
    fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'usePhotobooth.ts:showScreen', message: 'showScreen_called', data: { name, prev }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H2,H3' }) }).catch(() => {})
    // #endregion
    // 切到選版型／待機前先 reset，避免使用者看到預設版型閃現
    if (name === 'template') {
      // #region agent log
      const isTestBeforeReset = isTestSession.value
      fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b8574e' }, body: JSON.stringify({ sessionId: 'b8574e', location: 'usePhotobooth.ts:showScreen:before_reset', message: 'template_screen_isTest_before_reset', data: { name, isTestSession: isTestBeforeReset }, timestamp: Date.now(), hypothesisId: 'H1', runId: 'post-fix' }) }).catch(() => {})
      // #endregion
      const preserveTestSession = isTestSession.value
      resetSession()
      if (preserveTestSession) isTestSession.value = true
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/60461173-9774-483b-a750-822bb1590c42', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b8574e' }, body: JSON.stringify({ sessionId: 'b8574e', location: 'usePhotobooth.ts:showScreen:after_reset', message: 'template_screen_isTest_after_reset', data: { name, isTestSession: isTestSession.value }, timestamp: Date.now(), hypothesisId: 'H1', runId: 'post-fix' }) }).catch(() => {})
      // #endregion
      notifyBillAcceptorState(false)
    }
    if (name === 'idle') {
      resetSession()
      notifyBillAcceptorState(true)
    }
    currentScreen.value = name
  }

  function selectFilter(id: FilterId | null) {
    selectedFilter.value = id
  }

  function notifyBillAcceptorState(enabled: boolean) {
    try {
      const win = window as unknown as { chrome?: { webview?: { postMessage: (msg: string) => void } } }
      if (win.chrome?.webview) {
        win.chrome.webview.postMessage(
          JSON.stringify({ '@event': 'bill_acceptor_control', enabled })
        )
      }
    } catch {
      // ignore
    }
  }

  function getDefaultTemplateIndex(): number {
    if (!TEMPLATES.length) return 0
    const raw = import.meta.env.VITE_DEFAULT_TEMPLATE_INDEX
    const idx = raw !== undefined && raw !== '' ? parseInt(raw, 10) : 0
    if (Number.isNaN(idx) || idx < 0) return 0
    return Math.min(idx, TEMPLATES.length - 1)
  }

  function selectTemplate(t: Template | null) {
    selectedTemplate.value = t
  }

  function setCaptureResults(urls: string[]) {
    captureResults.value = urls
  }

  function setCaptureVideoBlob(blob: Blob | null) {
    captureVideoBlob.value = blob
  }

  function resetSession() {
    captureResults.value = []
    finalFilePath.value = null
    finalPreviewUrl.value = ''
    finalVideoUrl.value = ''
    qrImageUrl.value = ''
    qrText.value = ''
    captureVideoBlob.value = null
    selectedTemplate.value = null
    selectedFilter.value = null
    isTestSession.value = false
  }

  function setTestSession(isTest: boolean) {
    isTestSession.value = isTest
  }

  function setResultMock() {
    finalPreviewUrl.value = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    if (!isOfflineMode()) {
      qrText.value = 'https://example.com/test'
      QRCode.toDataURL('https://example.com/test', { width: 600, margin: 2 })
        .then((url: string) => { qrImageUrl.value = url })
        .catch(() => { qrImageUrl.value = '' })
    }
  }

  /**
   * 從 .env 讀取合成用座標（每格 寬,高,x,y 逗號串接），未設或格式錯誤則用 template.slots
   * 例：VITE_BK01_SYNTHESIS=544,471,43,244,544,471,42,1225,544,471,625,244,544,471,623,1061
   */
  function getSynthesisSlots(tpl: Template): TemplateSlot[] {
    const key = `VITE_${tpl.id.toUpperCase()}_SYNTHESIS` as keyof ImportMetaEnv
    const raw = import.meta.env[key]
    if (typeof raw !== 'string' || !raw.trim()) return tpl.slots
    const parts = raw.split(',').map((s) => parseInt(s.trim(), 10))
    const n = tpl.slots.length
    if (parts.length !== n * 4) return tpl.slots
    const slots: TemplateSlot[] = []
    for (let i = 0; i < n; i++) {
      const w = parts[i * 4 + 0] ?? NaN
      const h = parts[i * 4 + 1] ?? NaN
      const x = parts[i * 4 + 2] ?? NaN
      const y = parts[i * 4 + 3] ?? NaN
      if (Number.isNaN(w) || Number.isNaN(h) || Number.isNaN(x) || Number.isNaN(y)) return tpl.slots
      slots.push({ w, h, x, y })
    }
    return slots
  }

  const FILTER_CSS: Record<FilterId, string> = {
    'baby-pink':
      'brightness(1.17) contrast(0.88) saturate(1.11) hue-rotate(0deg) grayscale(0.14) sepia(0) invert(0) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'clear-blue':
      'brightness(1.11) contrast(1.1) saturate(0.87) hue-rotate(16deg) grayscale(0.36) sepia(0.04) invert(0.04) opacity(1) blur(0px) drop-shadow(1px 0px 0px rgba(0, 0, 0, 0))',
    'vintage-retro':
      'brightness(0.78) contrast(1.63) saturate(0.8) hue-rotate(-3.3deg) grayscale(0) sepia(0.39) invert(0.08) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'fresh-korean':
      'brightness(1.02) contrast(0.89) saturate(1.1) hue-rotate(-15deg) grayscale(0) sepia(0) invert(0) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'soft-milk-tea':
      'brightness(0.95) contrast(1) saturate(1.07) hue-rotate(0deg) grayscale(0.24) sepia(0.21) invert(0.03) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
    'neutral-gray':
      'brightness(1.09) contrast(1.11) saturate(1.84) hue-rotate(-15.7deg) grayscale(0.86) sepia(0.22) invert(0) opacity(1) blur(0px) drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))',
  }

  const FILTER_COLOR_BALANCE: Record<FilterId, { deltaR: number; deltaG: number; deltaB: number }> = {
    'baby-pink': { deltaR: -20.48, deltaG: -11.52, deltaB: 7.68 },
    'clear-blue': { deltaR: -30.72, deltaG: -26.88, deltaB: 30.72 },
    'vintage-retro': { deltaR: 17.92, deltaG: 0, deltaB: -16.64 },
    'fresh-korean': { deltaR: -12.8, deltaG: 0, deltaB: 19.2 },
    'soft-milk-tea': { deltaR: 6.4, deltaG: -7.68, deltaB: 8.96 },
    'neutral-gray': { deltaR: -48.64, deltaG: -15.36, deltaB: 15.36 },
  }

  /** 選中濾鏡對應的 Canvas filter（合成／預覽時套用）；選濾鏡模式一律用 canvas 繪圖 */
  function getFilterCssForCanvas(filterId: FilterId | null): string {
    if (!filterId) return 'none'
    return FILTER_CSS[filterId] ?? 'none'
  }

  /** 若該濾鏡需套色彩平衡則回傳 { deltaR, deltaG, deltaB }，否則 null */
  function getColorBalanceForFilter(
    filterId: FilterId | null
  ): { deltaR: number; deltaG: number; deltaB: number } | null {
    if (!filterId) return null
    return FILTER_COLOR_BALANCE[filterId] ?? null
  }

  /** 色彩平衡（如 PS 青↔紅、洋紅↔綠、黃↔藍），直接修改 ImageData */
  function applyColorBalance(
    imageData: ImageData,
    deltaR: number,
    deltaG: number,
    deltaB: number
  ): void {
    const data = imageData.data
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp((data[i] ?? 0) + deltaR)
      data[i + 1] = clamp((data[i + 1] ?? 0) + deltaG)
      data[i + 2] = clamp((data[i + 2] ?? 0) + deltaB)
    }
  }

  async function buildFinalOutput() {
    const tpl = selectedTemplate.value
    if (!tpl) return
    if (!captureResults.value.length) {
      try {
        const res = await callHost('load_captures', {}) as { urls?: string[] }
        if (Array.isArray(res.urls) && res.urls.length > 0) {
          captureResults.value = res.urls
        }
      } catch {
        // ignore
      }
    }
    if (!captureResults.value.length) return
    showScreen('uploading')
    await nextTick()
    try {
      const canvas = document.createElement('canvas')
      canvas.width = tpl.width
      canvas.height = tpl.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = src
        })
      // 底層：先畫照片（拍的照片在最底層），合成座標來自 env 或 template.slots
      const synthesisSlots = getSynthesisSlots(tpl)
      const filterCss = getFilterCssForCanvas(selectedFilter.value)
      for (let i = 0; i < Math.min(captureResults.value.length, synthesisSlots.length); i++) {
        const url = captureResults.value[i]
        const slot = synthesisSlots[i]
        if (url === undefined || url === '' || slot === undefined) continue
        const img = await loadImg(url)
        ctx.save()
        ctx.filter = filterCss
        // 填滿框、裁切溢出（object-fit: cover），與拍照頁預覽一致，避免 bk03 等正方形版型留白
        const scale = Math.max(slot.w / img.naturalWidth, slot.h / img.naturalHeight)
        const drawW = img.naturalWidth * scale
        const drawH = img.naturalHeight * scale
        const dx = slot.x + (slot.w - drawW) / 2
        const dy = slot.y + (slot.h - drawH) / 2
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, drawW, drawH)
        const balance = getColorBalanceForFilter(selectedFilter.value)
        if (balance) {
          const sx = Math.round(dx)
          const sy = Math.round(dy)
          const sw = Math.max(1, Math.round(drawW))
          const sh = Math.max(1, Math.round(drawH))
          const imageData = ctx.getImageData(sx, sy, sw, sh)
          applyColorBalance(imageData, balance.deltaR, balance.deltaG, balance.deltaB)
          ctx.putImageData(imageData, sx, sy)
        }
        ctx.restore()
        img.src = '' // 釋放解碼後的點陣圖記憶體
      }
      // 前景：再疊上 QRcodePage 外框（與版型同 id：bk01～bk04），外框在前、照片在後
      const qrBgUrl = `/assets/templates/QRcodePage/${tpl.id}.png`
      try {
        const bgImg = await loadImg(qrBgUrl)
        ctx.drawImage(bgImg, 0, 0, tpl.width, tpl.height, 0, 0, tpl.width, tpl.height)
        bgImg.src = '' // 釋放外框圖記憶體
      } catch {
        // 無外框圖時不覆蓋
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      canvas.width = 1
      canvas.height = 1
      const saveRes = await callHost('save_image', { imageData: dataUrl }) as { filePath?: string }
      const filePath = saveRes.filePath ?? ''
      finalFilePath.value = filePath
      finalPreviewUrl.value = dataUrl

      // 結果圖就緒（列印改由結果頁按鈕或 60 秒自動觸發）
      callHost('result_image_ready', {
        filePath,
        imageData: dataUrl,
        sizeKey: tpl.sizeKey ?? '4x6',
      }).catch(() => {})

      // 無網路版：不上傳、不產生 QR code
      if (!isOfflineMode()) {
        const basePage = typeof import.meta.env.VITE_DOWNLOAD_PAGE_BASE_URL === 'string' && import.meta.env.VITE_DOWNLOAD_PAGE_BASE_URL
          ? import.meta.env.VITE_DOWNLOAD_PAGE_BASE_URL.replace(/\/$/, '')
          : ''

        // 上傳完成後再進結果頁：取得圖片／影片 URL，組出帶參數的下載頁網址給 QR code
        let imageUrl = ''
        try {
          const uploadRes = await callHost('upload_file', { filePath }) as { url?: string }
          imageUrl = uploadRes?.url ?? ''
        } catch (e) {
          console.error('[拍貼機] 上傳合成圖失敗', e)
        }
        let videoUrl = ''
        if (captureVideoBlob.value) {
          const videoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(captureVideoBlob.value!)
          })
          try {
            const videoRes = await callHost('upload_video', { videoData: videoDataUrl }) as { url?: string }
            videoUrl = videoRes?.url ?? ''
            finalVideoUrl.value = videoUrl
          } catch (e) {
            console.error('[拍貼機] 上傳影片失敗', e)
          }
        }

        // 下載頁需 ?img=... 與選填 &video=...，掃 QR 才能顯示相片／影片
        const qrUrl = basePage
          ? `${basePage}?img=${encodeURIComponent(imageUrl)}${videoUrl ? `&video=${encodeURIComponent(videoUrl)}` : ''}`
          : (imageUrl || 'https://example.com/download')
        qrText.value = qrUrl
        QRCode.toDataURL(qrUrl, { width: 600, margin: 2 })
          .then((url) => { qrImageUrl.value = url })
          .catch(() => { qrImageUrl.value = '' })
      }

      showScreen('result')

      const isTestMode = (v: string | undefined) => v === '1' || String(v).toLowerCase() === 'true'
      if (!isTestMode(import.meta.env.VITE_TEST_FAST_COUNTDOWN) && isTestMode(import.meta.env.VITE_LOG_USAGE)) {
        try {
          await callHost('append_usage_log', {
            folder: 'daily report',
            time: new Date().toISOString(),
            templateId: tpl.id,
            projectName: import.meta.env.VITE_PROJECT_NAME ?? '',
            isTest: isTestSession.value, // 標記是否為測試資料
          })
        } catch {
          // ignore
        }
      }
    } finally {
      // 不再使用 setLoading，由「照片上傳中」頁面取代轉圈圈
    }
  }

  function runDevStartPage() {
    const filterDirect = String(import.meta.env.VITE_TEST_FILTER_DIRECT ?? '').trim()
    if (filterDirect === '1' || filterDirect.toLowerCase() === 'true') {
      showScreen('shoot')
      return
    }
    const raw = import.meta.env.VITE_DEV_START_PAGE
    const n = raw !== undefined && raw !== '' ? parseInt(raw, 10) : null
    if (n == null || n < 0 || n > 4) return
    const names: ScreenName[] = ['idle', 'template', 'shoot', 'result', 'processing']
    const name = names[n]
    if (name !== undefined) showScreen(name)
  }

  return {
    currentScreen,
    selectedTemplate,
    selectedFilter,
    loading,
    captureResults,
    finalFilePath,
    finalPreviewUrl,
    resultDisplayUrl,
    finalVideoUrl,
    qrImageUrl,
    qrText,
    showQrCode,
    qrDisplayUrl,
    qrDisplayText,
    autoPrint,
    isTestSession,
    templates,
    setLoading,
    showScreen,
    getDefaultTemplateIndex,
    selectTemplate,
    selectFilter,
    getFilterCssForCanvas,
    getColorBalanceForFilter,
    applyColorBalance,
    setCaptureResults,
    setCaptureVideoBlob,
    resetSession,
    buildFinalOutput,
    runDevStartPage,
    setResultMock,
    callHost,
    setCaptureResultsFromTestImages,
    setTestSession,
  }
}
