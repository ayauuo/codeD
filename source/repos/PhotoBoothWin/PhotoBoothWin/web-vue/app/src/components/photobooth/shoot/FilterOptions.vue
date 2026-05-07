<script setup lang="ts">
import { usePhotobooth } from '@/composables/usePhotobooth'
import type { FilterId } from '@/types/photobooth'

defineOptions({ name: 'FilterOptions' })

const { selectedFilter, selectFilter } = usePhotobooth()

const FILTER_OPTIONS: { id: FilterId; label: string }[] = [
  { id: 'baby-pink', label: '粉嫩嬰兒' },
  { id: 'clear-blue', label: '清透藍色' },
  { id: 'vintage-retro', label: '懷舊復古' },
  { id: 'fresh-korean', label: '清新韓系' },
  { id: 'soft-milk-tea', label: '溫柔奶茶' },
  { id: 'neutral-gray', label: '中性灰度' },
]

function onFilterClick(id: FilterId) {
  selectFilter(selectedFilter.value === id ? null : id)
}
</script>

<template>
  <div class="filter-options" role="group" aria-label="選擇濾鏡">
    <div class="filter-options__scroll">
    <button
      v-for="opt in FILTER_OPTIONS"
      :key="opt.id"
      type="button"
      class="filter-options__item"
      :class="{ 'is-selected': selectedFilter === opt.id }"
      @click="onFilterClick(opt.id)"
    >
      {{ opt.label }}
    </button>
    </div>
    <p class="filter-options__hint">再次點擊選項，即可取消濾鏡</p>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.filter-options {
  display: flex;
  flex-direction: column;
  padding: 0;
  width: 250px;
  max-height: 100vh;
  overflow: hidden;
}

.filter-options__hint {
  flex-shrink: 0;
  margin: 8px 0 0;
  padding: 0 4px;
  font-size: 30px;
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: 0.02em;
  color: $color-333;
  text-align: center;
  /* 白邊：多層 text-shadow 模擬描邊，在放射線背景上較易辨識 */
  text-shadow:
    0 0 6px #fff,
    0 0 12px rgba(255, 255, 255, 0.95),
    -2px -2px 0 #fff,
    2px -2px 0 #fff,
    -2px 2px 0 #fff,
    2px 2px 0 #fff,
    -1px 0 0 #fff,
    1px 0 0 #fff,
    0 -1px 0 #fff,
    0 1px 0 #fff;
}

.filter-options__scroll {
  /* 勿 flex:1 撐滿高度，否則提示文字會被擠到畫面底部、與按鈕距離過大 */
  flex: 0 1 auto;
  max-height: min(calc(100vh - 220px), 900px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding: 8px 0 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-options__item {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 250px;
  height: 100px;
  padding: 0 16px;
  font-size: 32px;
  color: #fff;
  text-align: center;
  background: #000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: background 0.2s, box-shadow 0.2s;

  &:hover {
    background: #1a1a1a;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
  }

  &.is-selected {
    background: #1a1a1a;
    box-shadow: 0 0 0 2px #ff4d4f;
  }
}
</style>
