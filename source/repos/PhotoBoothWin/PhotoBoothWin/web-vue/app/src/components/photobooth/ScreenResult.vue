<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import { usePhotobooth } from '@/composables/usePhotobooth'

const {
  currentScreen,
  finalFilePath,
  finalPreviewUrl,
  resultDisplayUrl,
  showQrCode,
  qrDisplayUrl,
  selectedTemplate,
  showScreen,
  callHost,
  resetSession,
  autoPrint,
  isTestSession,
  extraPrintTriggerPrint,
  extraPrintPendingCopies,
  extraPrintReceivedCents,
  startExtraPrintAwaitPayment,
  cancelExtraPrintAwaitPayment,
} = usePhotobooth()

const copies = ref(1)
/** 無網路版加印：closed | pick（選張數）| pay（等待投錢） */
const extraPrintStep = ref<'closed' | 'pick' | 'pay'>('closed')
const extraPrintQty = ref(1)
const autoGoTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const extraPrintPayTarget = computed(() => {
  const p = extraPrintPendingCopies.value
  return p == null ? 0 : p * 100
})

function getResultAutoPrintSec(): number {
  const raw = import.meta.env.VITE_RESULT_AUTO_PRINT_SEC
  if (raw === undefined || raw === '') return 60
  const n = parseInt(raw, 10)
  return Number.isNaN(n) || n < 1 ? 60 : Math.min(300, n)
}

function getPrintingShowSec(): number {
  const raw = import.meta.env.VITE_PRINTING_SHOW_SEC
  if (raw === undefined || raw === '') return 20
  const n = parseInt(raw, 10)
  return Number.isNaN(n) || n < 1 ? 20 : Math.min(120, n)
}

function getSkipPrint(): boolean {
  const v = import.meta.env.VITE_SKIP_PRINT
  return v === '1' || String(v).toLowerCase() === 'true'
}

/** 環境變數單價（元／張），對應 VITE_RECEIPT_AMOUNT；未設或無效則為 0 */
function getReceiptUnitAmount(): number {
  const v = import.meta.env.VITE_RECEIPT_AMOUNT
  if (typeof v !== 'string' || v.trim() === '') return 0
  const n = parseFloat(v.trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function getLogPrintRecordWhenSkip(): boolean {
  const v = import.meta.env.VITE_LOG_PRINT_RECORD_WHEN_SKIP
  return v === '1' || String(v).toLowerCase() === 'true'
}

function getProjectName(): string {
  const v = import.meta.env.VITE_PROJECT_NAME
  return typeof v === 'string' ? v : ''
}

function getMachineName(): string {
  const v = import.meta.env.VITE_MACHINE_NAME
  return typeof v === 'string' ? v : ''
}

function getIsTest(): boolean {
  // 只要是從測試相關按鈕進來的流程，前端會把 isTestSession 設為 true
  // 若沒有 session 旗標，才退回檢查 env（相容舊的測試方式）
  if (isTestSession.value) return true
  const v = import.meta.env.VITE_TEST_FAST_COUNTDOWN
  return v === '1' || String(v).toLowerCase() === 'true'
}

/**
 * 寫入列印紀錄／資料庫「收取金額」：單價 × 該次列印張數；測試資料一律 0。
 * @param printCopies 可選，與 log 的 copies 一致；未傳則用 copies ref（加印／手動列印已先設好）
 */
function getLogPrintRecordAmount(printCopies?: number): string {
  if (getIsTest()) return '0'
  const c =
    printCopies !== undefined
      ? Math.min(99, Math.max(1, Math.round(printCopies)))
      : Math.min(99, Math.max(1, Math.round(Number(copies.value)) || 1))
  const total = Math.round(getReceiptUnitAmount() * c)
  return String(total)
}

function getFinalFileName(): string {
  const path = finalFilePath.value
  if (!path) return ''
  return path.replace(/^.*[/\\]/, '') || ''
}

function clearAutoGoTimer() {
  if (autoGoTimer.value != null) {
    clearTimeout(autoGoTimer.value)
    autoGoTimer.value = null
  }
}

/** 關閉對話後恢復結果頁 N 秒自動列印計時（加印停用時仍供列印流程使用） */
function restartAutoPrintTimerIfNeeded() {
  if (currentScreen.value !== 'result' || !finalFilePath.value) return
  clearAutoGoTimer()
  const sec = getResultAutoPrintSec()
  autoGoTimer.value = setTimeout(() => {
    autoGoTimer.value = null
    goToPrintingThenIdle()
  }, sec * 1000)
}

/** 進入列印中 → 送 DNP（若未設 VITE_SKIP_PRINT）→ 寫入列印紀錄 CSV → 顯示 N 秒後回待機並還原 */
function goToPrintingThenIdle() {
  const printingSec = getPrintingShowSec()
  const skipPrint = getSkipPrint()
  showScreen('processing')
  if (!finalFilePath.value) {
    setTimeout(() => { autoPrint.value = false; resetSession(); showScreen('idle') }, printingSec * 1000)
    return
  }
  if (skipPrint) {
    if (getLogPrintRecordWhenSkip()) {
      callHost('log_print_record', {
        templateName: selectedTemplate.value?.id ?? 'unknown',
        printTime: new Date().toISOString(),
        amount: getLogPrintRecordAmount(1),
        projectName: getProjectName(),
        machineName: getMachineName(),
        copies: 1,
        fileName: getFinalFileName(),
        isTest: getIsTest(),
      }).finally(() => {
        setTimeout(() => { autoPrint.value = false; resetSession(); showScreen('idle') }, printingSec * 1000)
      })
    } else {
      setTimeout(() => { autoPrint.value = false; resetSession(); showScreen('idle') }, printingSec * 1000)
    }
    return
  }
  callHost('print_hotfolder', {
    filePath: finalFilePath.value,
    sizeKey: selectedTemplate.value?.sizeKey ?? '4x6',
    copies: 1,
  })
    .then(() =>
      callHost('log_print_record', {
        templateName: selectedTemplate.value?.id ?? 'unknown',
        printTime: new Date().toISOString(),
        amount: getLogPrintRecordAmount(1),
        projectName: getProjectName(),
        machineName: getMachineName(),
        copies: 1,
        fileName: getFinalFileName(),
        isTest: getIsTest(),
      })
    )
    .finally(() => {
      setTimeout(() => {
        autoPrint.value = false
        resetSession()
        showScreen('idle')
      }, printingSec * 1000)
    })
}

// 結果頁：有合成結果時啟動 N 秒（ENV）自動列印，沒按就自動進列印中（需 VITE_SKIP_PRINT=0 才會真的送 DNP）
watch(
  [() => currentScreen.value, () => finalFilePath.value, extraPrintStep],
  ([screen, path, step]) => {
    clearAutoGoTimer()
    if (screen !== 'result' || !path || step !== 'closed') return
    const sec = getResultAutoPrintSec()
    autoGoTimer.value = setTimeout(() => {
      autoGoTimer.value = null
      goToPrintingThenIdle()
    }, sec * 1000)
  },
  { immediate: true }
)

onBeforeUnmount(clearAutoGoTimer)

function bumpExtraPrintQty(delta: number) {
  const n = extraPrintQty.value + delta
  extraPrintQty.value = Math.min(5, Math.max(1, n))
}

function openExtraPrintDialog() {
  clearAutoGoTimer()
  extraPrintQty.value = 1
  extraPrintStep.value = 'pick'
}

function closeExtraPrintDialog() {
  extraPrintStep.value = 'closed'
  cancelExtraPrintAwaitPayment()
  restartAutoPrintTimerIfNeeded()
}

function confirmExtraPrintPick() {
  startExtraPrintAwaitPayment(extraPrintQty.value)
  extraPrintStep.value = 'pay'
}

function cancelExtraPrintPay() {
  closeExtraPrintDialog()
}

function onExtraPrintBackdropClick() {
  if (extraPrintStep.value === 'pick') closeExtraPrintDialog()
}

/**
 * @param printCopies 實際送印張數（1～99）
 * @param printingShowSec ENV VITE_PRINTING_SHOW_SEC 的 T；列印頁停留 = (T−1) + (T−1)×加印張數，加印張數 = 送印張數−1；T−1 至少為 1
 */
async function runPrintJob(printCopies: number, printingShowSec: number) {
  if (!finalFilePath.value) return
  clearAutoGoTimer()
  cancelExtraPrintAwaitPayment()
  extraPrintStep.value = 'closed'
  let c = printCopies
  if (Number.isNaN(c)) c = 1
  copies.value = Math.min(99, Math.max(1, Math.round(c)))
  const amountCopies = copies.value
  const extraPrintCount = Math.max(0, amountCopies - 1)
  const baseSec = Math.max(1, printingShowSec - 1)
  const processingWaitSec = baseSec + baseSec * extraPrintCount
  const skipPrint = getSkipPrint()
  showScreen('processing')
  if (skipPrint) {
    if (getLogPrintRecordWhenSkip()) {
      await callHost('log_print_record', {
        templateName: selectedTemplate.value?.id ?? 'unknown',
        printTime: new Date().toISOString(),
        amount: getLogPrintRecordAmount(amountCopies),
        projectName: getProjectName(),
        machineName: getMachineName(),
        copies: copies.value,
        fileName: getFinalFileName(),
        isTest: getIsTest(),
      })
    }
    autoPrint.value = false
    resetSession()
    setTimeout(() => showScreen('idle'), processingWaitSec * 1000)
    return
  }
  await callHost('print_hotfolder', {
    filePath: finalFilePath.value,
    sizeKey: selectedTemplate.value?.sizeKey ?? '4x6',
    copies: copies.value,
  })
  await callHost('log_print_record', {
    templateName: selectedTemplate.value?.id ?? 'unknown',
    printTime: new Date().toISOString(),
    amount: getLogPrintRecordAmount(amountCopies),
    projectName: getProjectName(),
    machineName: getMachineName(),
    copies: copies.value,
    fileName: getFinalFileName(),
    isTest: getIsTest(),
  })
  autoPrint.value = false
  resetSession()
  setTimeout(() => showScreen('idle'), processingWaitSec * 1000)
}

async function onPrint() {
  await runPrintJob(1, getPrintingShowSec())
}

watch(extraPrintTriggerPrint, (v) => {
  if (!v) return
  const sheets = v.copies
  extraPrintTriggerPrint.value = null
  extraPrintStep.value = 'closed'
  void runPrintJob(sheets, getPrintingShowSec())
})
</script>

<template>
  <div
    class="screen screen--result"
    :class="{ 'screen--result-offline': !showQrCode }"
    role="region"
    aria-label="結果畫面"
  >
    <!-- 無 QR（離線）：預覽與按鈕共用同一欄寬，按鈕對齊圖片水平中央 -->
    <div v-if="!showQrCode" class="result-offline">
      <div class="result-offline__stack">
        <div class="result-offline__preview">
          <img id="final-preview" alt="列印預覽" :src="resultDisplayUrl" />
        </div>
        <div class="result-offline__bar">
          <div class="result-offline__actions">
            <button type="button" class="extra-print-btn" @click="openExtraPrintDialog">
              <img src="/assets/templates/QRcodePage/PrintMore.png" alt="加印" />
            </button>
            <button type="button" class="print-btn print-btn--offline" @click="onPrint">
              <img src="/assets/templates/QRcodePage/printbutton.png" alt="列印" />
            </button>
          </div>
        </div>
        <div
          v-if="extraPrintStep !== 'closed'"
          class="extra-print-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="加印"
          @click.self="onExtraPrintBackdropClick"
        >
          <div v-if="extraPrintStep === 'pick'" class="extra-print-dialog" @click.stop>
            <div class="extra-print-dialog__window">
              <img src="/assets/templates/QRcodePage/window.png" alt="" class="extra-print-dialog__window-bg" />
              <div class="extra-print-dialog__pick">
                <p class="extra-print-qty__label">想要加印的數量</p>
                <div class="extra-print-qty" aria-label="付費張數">
                  <button type="button" class="extra-print-qty__btn" @click="bumpExtraPrintQty(-1)">−</button>
                  <span class="extra-print-qty__num">{{ extraPrintQty }}</span>
                  <button type="button" class="extra-print-qty__btn" @click="bumpExtraPrintQty(1)">+</button>
                </div>
                <div class="extra-print-dialog__pick-actions">
                  <button
                    type="button"
                    class="extra-print-dialog__imgbtn extra-print-dialog__imgbtn--pick-cancel"
                    @click="closeExtraPrintDialog"
                  >
                    <img src="/assets/templates/QRcodePage/repeat.png" alt="取消" />
                  </button>
                  <button
                    type="button"
                    class="extra-print-dialog__imgbtn extra-print-dialog__imgbtn--pick-confirm"
                    @click="confirmExtraPrintPick"
                  >
                    <img src="/assets/templates/QRcodePage/confirm.png" alt="確定" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="extraPrintStep === 'pay'" class="extra-print-dialog" @click.stop>
            <div class="extra-print-dialog__window">
              <img src="/assets/templates/QRcodePage/window.png" alt="" class="extra-print-dialog__window-bg" />
              <div class="extra-print-dialog__pay">
                <p class="extra-print-pay__hint">
                  請投入 {{ extraPrintPayTarget }} 元（已收 {{ extraPrintReceivedCents }} 元）
                </p>
                <div class="extra-print-dialog__pay-cancel-wrap">
                  <button
                    type="button"
                    class="extra-print-dialog__imgbtn extra-print-dialog__imgbtn--pay-cancel"
                    @click="cancelExtraPrintPay"
                  >
                    <img src="/assets/templates/QRcodePage/repeat.png" alt="取消加印" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 有 QR：左圖右 QR + 列印圖示按鈕 -->
    <div v-else class="result-wrap">
      <div class="result-preview">
        <img id="final-preview" alt="final preview" :src="resultDisplayUrl" />
      </div>
      <div class="right-panel">
        <h2 class="qr-title">掃描QRcode儲存照片</h2>
        <div class="qr-panel">
          <div class="qr-frame">
            <img id="qr-image" alt="qr code" :src="qrDisplayUrl" />
          </div>
          <div class="print-section">
            <div class="input-row"></div>
          </div>
        </div>
        <div class="btns">
          <button type="button" class="print-btn" @click="onPrint">
            <img src="/assets/templates/QRcodePage/printbutton.png" alt="確認儲存完畢" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.screen--result {
  display: flex;
  flex-direction: row;
  width: 100%;
  min-height: 100vh;
  background-image: url('#{$path-templates}/QRcodePage/background.png');
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
  padding: $spacing-5xl;
}

.screen--result-offline {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: $spacing-sm $spacing-3xl $spacing-3xl;
  box-sizing: border-box;
}

.result-offline {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.result-offline__stack {
  width: 100%;
  max-width: min(96vw, 860px);
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.result-offline__preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  width: 100%;
  padding: 0 0 $spacing-xl;
  margin-bottom: 0;

  img {
    max-width: 100%;
    max-height: calc(100vh - 200px);
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.12));
  }
}

.result-offline__bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 100%;
  padding-top: $spacing-md;
}

/** 離線結果：列印 + 加印（橫排垂直置中、間距略增、尺寸略縮） */
.result-offline__actions {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: $spacing-xl;
  width: 100%;
  max-width: min(96vw, 860px);
}

/** 兩張 PNG 長寬比不同，統一 img 顯示高度避免一高一低 */
.result-offline__actions .extra-print-btn img,
.result-offline__actions .print-btn.print-btn--offline img {
  width: auto;
  max-width: 100%;
  height: clamp(68px, 9vh, 108px);
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}

.extra-print-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 0;
  margin-bottom: 16px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  flex: 0 0 auto;
  min-width: 0;
  width: auto;
  max-width: min(260px, 34vw);
}

.extra-print-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-xl;
  box-sizing: border-box;
}

.extra-print-dialog {
  max-width: min(560px, 94vw);
  width: 100%;
}

.extra-print-dialog__window {
  position: relative;
  width: 100%;
}

.extra-print-dialog__window-bg {
  width: 100%;
  height: auto;
  display: block;
  pointer-events: none;
}

.extra-print-dialog__pick {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-sm;
  width: 70%;
}

.extra-print-qty__label {
  margin: 0;
  padding: 0;
  font-size: clamp(40px, 2.5vw, 22px);
  font-weight: 600;
  color: rgb(0, 0, 0);
  text-align: center;
  line-height: 1.35;
}

.extra-print-qty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $spacing-lg;
}

.extra-print-dialog__pick-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: $spacing-md;
  margin-top: $spacing-xs;
}

.extra-print-dialog__pick-actions .extra-print-dialog__imgbtn {
  flex: 1 1 0;
  max-width: min(200px, 46%);
  width: auto;
}

.extra-print-qty__btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 2px solid $color-333;
  background: #fff;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.extra-print-qty__num {
  font-size: 36px;
  font-weight: 700;
  min-width: 2ch;
  text-align: center;
  color: $color-333;
}

.extra-print-dialog__imgbtn {
  display: block;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  max-width: 220px;
  width: 70%;

  img {
    width: 100%;
    height: auto;
    display: block;
  }
}

.extra-print-dialog__imgbtn--secondary {
  max-width: 160px;
  width: 55%;
}

.extra-print-dialog__pay {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-lg;
  width: 70%;
  box-sizing: border-box;
}

.extra-print-pay__hint {
  font-size: clamp(50px, 2.6vw, 22px);
  font-weight: 600;
  color: rgb(0, 0, 0);
  margin: 0;
  line-height: 1.45;
  text-align: center;
}

.extra-print-dialog__pay-cancel-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.extra-print-dialog__imgbtn--pay-cancel {
  max-width: min(200px, 55%);
  width: auto;
}

.result-wrap {
  display: flex;
  // flex-direction: row;
  // flex: 1;
  // align-items: center;
  // justify-content: center;
  gap: $spacing-4xl;
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}

.result-preview {
  width: 50%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;

  img {
    max-width: 100%;
    max-height: calc(100vh - 48px);
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
}

.right-panel {
  width: 50%;
  padding-top: 0px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  h2{
    font-size: 40px;
    letter-spacing: 4px;
  }
}

.qr-panel {
  border: 8px solid black;
  border-radius: 28px;
  // background-color: aqua;
  width: 650px;
  height: 650px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-lg;
  // width: 320px;
}

.qr-title {
  font-size: 20px;
  font-weight: bold;
  color: $color-333;
  text-align: center;
  margin: 0;
}

.qr-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 500px;
  height: 500px;
  // flex-shrink: 0;
}

.qr-frame img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.qr-text {
  font-size: 12px;
  color: $color-gray-666;
  word-break: break-all;
  text-align: center;
  margin: 0;
  max-width: 280px;
}

.print-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  width: 100%;
}

.input-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $spacing-sm;

  label {
    font-size: 14px;
    color: $color-333;
  }

  input {
    font-size: 16px;
    padding: $spacing-xs $spacing-sm;
    width: 80px;
  }
}

.print-btn {
  margin-top: 38px;
  margin-bottom: 10px;
  display: block;
  width: min(350px, 92vw);
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;

  img {
    width: 60%;
    margin-bottom: 10px;
    height: auto;
    display: block;
  }
}

/* 須寫在 .print-btn 之後且提高權重，否則 display/margin 會被蓋掉導致離線按鈕圖靠左 */
.print-btn.print-btn--offline {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: -5px;
  margin-bottom: 20px;
  width: 100%;
  max-width: min(350px, 92vw);

  img {
    width: 50%;
    height: auto;
    display: block;
    flex-shrink: 0;
  }
}

.result-offline__actions .print-btn.print-btn--offline {
  flex: 0 0 auto;
  min-width: 0;
  width: auto;
  max-width: min(260px, 34vw);
  align-items: center;
  margin-top: 10px;
  margin-bottom: 16px;
}

/* 未來若要按鈕跳動可啟用
.print-btn--pulse {
  animation: print-btn-pulse 1.5s ease-in-out infinite;
}

@keyframes print-btn-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.04);
    opacity: 0.95;
  }
}
*/
</style>
