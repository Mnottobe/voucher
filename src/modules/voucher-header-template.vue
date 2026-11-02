<script setup lang="ts">
import type { VoucherTemplate } from "../types";
defineOptions({ name: 'VoucherHeaderTemplate' });
const props = defineProps<{
  localForm: VoucherTemplate;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:localForm', value: Partial<VoucherTemplate>): void;
}>();

function onInput(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('update:localForm', { templateName: target.value });
}
</script>

<template>
  <div class="voucher-info">
    <div class="info-item gap-10">
      <div>
        <label class="info_lable">模版名称：</label>
        <input
          :value="props.localForm.templateName"
          class="input-150"
          placeholder="无"
          :disabled="props.disabled"
          @input="onInput"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* keep styles scoped to component */
.input-150 {
  width: 150px;
  height: 32px;
  text-align: center;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 0 12px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: #fafafa;
}

.input-150:hover {
  border-color: #40a9ff;
  background: #ffffff;
}

.input-150:focus {
  outline: none;
  border-color: #1890ff;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.input-150:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
}

/* 从父组件迁移的通用头部样式 */
.voucher-info {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}
.info-item {
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 10px;
}
.info_lable {
  font-size: 14px;
  color: #262626;
  font-weight: 500;
}
</style>
