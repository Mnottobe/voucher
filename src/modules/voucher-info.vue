<script setup lang="ts">
import type { VoucherForm } from "../types";
import { computed } from 'vue';

defineOptions({ name: 'VoucherInfo' });
const props = defineProps<{
  localForm: VoucherForm;
}>();

const sourceText = computed(() => {
  const sourceMap: Record<string, string> = {
    '1': '手工录入',
    '2': '系统生成',
    '3': '红冲凭证',
    '4': '期末结转'
  };
  return sourceMap[String(props.localForm.voucherSource)] || '手工录入';
});
</script>

<template>
  <div class="voucher-info voucher-info-flex">
    <div class="info-item flex-row-center-gap8">
      <span>凭证来源：{{ sourceText }}</span>
    </div>
    <div class="flex-column-gap8">
      <div class="info-item flex-row-center-gap8">
        <span>制单人：{{ props.localForm.createdByName || props.localForm.createdBy }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 从父组件迁移的凭证信息区样式 */
.voucher-info {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 16px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}
.voucher-info-flex {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.info-item {
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 10px;
  color: #595959;
}
.info-item span {
  font-weight: 500;
}
.info_lable {
  font-size: 14px;
  color: #1890ff;
  font-weight: 600;
}
.flex-column-gap8 {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.flex-row-center-gap8 {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
