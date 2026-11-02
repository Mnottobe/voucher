<script setup lang="ts">
import { ref } from 'vue';
import { Voucher } from '../src';
import type { VoucherForm, VoucherTemplate, Subject } from '../src';
const data = ref<VoucherForm | VoucherTemplate>({ id: 'demo', voucherNumber: 1, attachmentCount: 0, voucherSource: 1, voucherDate: Date.now(), createdByName: '演示用户', voucherEntryList: [
{ id: '1', entryNumber: 1, entrySummary: '收到货款', subjectId: '1002', auxiliaries: [], debitAmount: 1000, creditAmount: null },
{ id: '2', entryNumber: 2, entrySummary: '收到货款', subjectId: '6001', auxiliaries: [], debitAmount: null, creditAmount: 1000 }
] });
const subjects: Subject[] = [{ id: '1002', code: '1002', name: '银行存款' }, { id: '6001', code: '6001', name: '主营业务收入' }];
const disabled = ref(false);
</script>
<template><main><h1>Voucher</h1><label><input v-model="disabled" type="checkbox">只读预览</label><div class="scroll"><Voucher v-model:data="data" :is-template="false" :subject-list="subjects" :disabled="disabled" /></div><details><summary>表单数据</summary><pre>{{ data }}</pre></details></main></template>
<style>body{margin:0;font-family:system-ui;background:#f4f6f8;color:#253047}main{padding:24px}.scroll{overflow:auto}pre{white-space:pre-wrap}</style>
