<script setup lang="ts">
import type { VoucherEntry, VoucherForm, VoucherTemplate, SubjectAuxiliaryConfig, CurrencyCode } from "./types";
import { computed, ref, watch } from 'vue';
import VoucherHeaderNormal from './modules/voucher-header-normal.vue';
import VoucherHeaderTemplate from './modules/voucher-header-template.vue';
import VoucherTableBody from './modules/voucher-table-body.vue';
import VoucherInfo from './modules/voucher-info.vue';

defineOptions({ name: 'Voucher' });

import type { Subject } from './types';

interface Props {
  data: VoucherForm | VoucherTemplate;
  isTemplate: boolean;
  currentPeriod?: string;
  minRows?: number;
  disabled?: boolean;
  subjectList?: Subject[];
  auxiliaryList?: Subject[];
  currencyRates?: Partial<Record<CurrencyCode, number>>;
  auxiliaryCategoryLabels?: Record<number, string>;
}

const props = withDefaults(defineProps<Props>(), {
  minRows: 4,
  currentPeriod: '',
  disabled: false,
  subjectList: () => [],
  auxiliaryList: () => []
});

const emit = defineEmits<{
  (e: 'update:data', value: VoucherForm | VoucherTemplate): void;
}>();

const localForm = ref<VoucherForm | VoucherTemplate>({ ...props.data });
const normalForm = computed(() => localForm.value as VoucherForm);
const templateForm = computed(() => localForm.value as VoucherTemplate);

// 监听外部数据变化，更新本地数据
watch(
  () => props.data,
  newData => {
    localForm.value = { ...newData };
  },
  { deep: true }
);

const localEntry = computed(() => {
  const entries = (localForm.value as any).voucherEntryList;
  return entries || [];
});

function updateForm(patch: Partial<VoucherForm | VoucherTemplate>) {
  localForm.value = { ...localForm.value, ...patch };
  emit('update:data', localForm.value);
}

function updateEntry(entries: VoucherEntry[]) {
  localForm.value = { ...localForm.value, voucherEntryList: entries };
  emit('update:data', localForm.value);
}
</script>

<template>
  <div class="voucher-wrapper">
    <div class="voucher-container">
      <VoucherHeaderNormal
        v-if="!isTemplate"
        :local-form="normalForm"
        :current-period="currentPeriod"
        :disabled="disabled"
        @update:local-form="updateForm"
      />

      <VoucherHeaderTemplate
        v-else-if="isTemplate"
        :local-form="templateForm"
        :disabled="disabled"
        @update:local-form="updateForm"
      />

      <VoucherTableBody
        :entries="localEntry"
        :min-rows="minRows"
        :disabled="disabled"
        :subject-list="subjectList"
        :auxiliary-list="auxiliaryList"
        :currency-rates="currencyRates"
        :auxiliary-category-labels="auxiliaryCategoryLabels"
        @update-entry="updateEntry"
      />

      <VoucherInfo v-if="!isTemplate" :local-form="normalForm" :disabled="disabled" />
    </div>
  </div>
</template>

<style scoped>
.voucher-wrapper {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.voucher-container {
  width: 1350px;
  background: #fafbfc;
  border-radius: 12px;
  /* 纸张一直处在「浮起来」的那一档：原来的 hover 加深效果改成常驻，不再随鼠标进出变化 */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 45px;
}
</style>
