<script setup lang="ts">
import type { VoucherForm } from "../types";
import { computed } from 'vue';
import dayjs from 'dayjs';
import DatePicker from '../components/date-picker.vue';

defineOptions({ name: 'VoucherHeaderNormal' });

const props = defineProps<{
  localForm: VoucherForm;
  // 父层传入的当前会计期间（可选），优先使用
  currentPeriod?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:localForm', value: Partial<VoucherForm>): void;
}>();

function updateForm(patch: Partial<VoucherForm>) {
  emit('update:localForm', patch);
}

// 数字输入限制
const handlePositiveIntInput = (val: string, key: 'voucherNumber' | 'attachmentCount') => {
  let v = val.replace(/[-.]/g, '');
  v = v.replace(/[^0-9]/g, '');
  v = v.replace(/^0+/, '');
  const num = Number(v);
  updateForm({ [key]: num } as any);
};

// 日期：内部使用原生 input date 格式
const formattedPreparationDate = computed({
  get: () => props.localForm.voucherDate || '',
  set: val => {
    updateForm({ voucherDate: val });
  }
});

const formattedAccountingPeriod = computed({
  get: () => props.localForm.period || '',
  set: val => {
    updateForm({ period: val });
  }
});

// 最小日期限制
const minDate = computed(() => {
  if (props.currentPeriod) {
    return props.currentPeriod;
  }
  if (props.localForm.period) {
    return props.localForm.period;
  }
  return '';
});

const minPreparationDate = computed(() => {
  if (!minDate.value) {
    return '';
  }
  // 会计期间的第一天
  return dayjs(minDate.value).startOf('month').format('YYYY-MM-DD');
});

const minAccountingPeriod = computed(() => {
  if (!minDate.value) {
    return '';
  }
  return dayjs(minDate.value).format('YYYY-MM');
});
</script>

<template>
  <div class="voucher-info">
    <div class="info-item gap-10">
      <div class="voucher-number-wrapper">
        <label class="info_lable">凭证编号：</label>
        <input
          :value="String(props.localForm.voucherNumber || '')"
          type="number"
          class="input-50"
          placeholder="0"
          :disabled="props.disabled"
          @input="e => handlePositiveIntInput((e.target as HTMLInputElement).value, 'voucherNumber')"
        />
      </div>

      <div class="attachment-wrapper">
        <label class="info_lable">附单据</label>
        <input
          :value="String(props.localForm.attachmentCount || '')"
          type="number"
          class="input-50-ml5"
          placeholder="0"
          :disabled="props.disabled"
          @input="e => handlePositiveIntInput((e.target as HTMLInputElement).value, 'attachmentCount')"
        />
        <label class="info_lable ml-5">张</label>
      </div>
    </div>

    <div class="info-item flex-row-center-gap8 gap-10">
      <div class="date-wrapper">
        <label class="info_lable">日期：</label>
        <DatePicker
          v-model="formattedPreparationDate"
          type="date"
          :min="minPreparationDate"
          :disabled="props.disabled"
        />
      </div>
      <div class="period-wrapper">
        <label class="info_lable ml-5">会计期间：</label>
        <DatePicker
          v-model="formattedAccountingPeriod"
          type="month"
          :min="minAccountingPeriod"
          :disabled="props.disabled"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-50 {
  width: 50px;
  height: 32px;
  text-align: center;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: #fafafa;
}

.input-50:hover {
  border-color: #40a9ff;
  background: #ffffff;
}

.input-50:focus {
  outline: none;
  border-color: #1890ff;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.input-50:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
}

.input-50-ml5 {
  width: 50px;
  height: 32px;
  margin-left: 5px;
  text-align: center;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: #fafafa;
}

.input-50-ml5:hover {
  border-color: #40a9ff;
  background: #ffffff;
}

.input-50-ml5:focus {
  outline: none;
  border-color: #1890ff;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.input-50-ml5:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
}

.ml-5 {
  margin-left: 5px;
}

/* 移除 number input 的上下箭头 */
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.gap-10 {
  display: flex;
  gap: 10px;
}
.voucher-number-wrapper {
  display: flex;
  align-items: center;
  min-width: 100px;
  flex-shrink: 0;
}
.attachment-wrapper {
  display: flex;
  align-items: center;
  min-width: 130px;
  flex-shrink: 0;
}
.date-wrapper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  white-space: nowrap;
}
.period-wrapper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  white-space: nowrap;
}
.info-item {
  display: flex;
}

/* 从父组件迁移：凭证头部和信息区域样式 */
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

.gap-8 {
  gap: 8px;
}
.flex-row-center-gap8 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.center-flex {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
