<script setup lang="ts">
import type { VoucherEntryAuxiliary, VoucherEntry, SubjectAuxiliaryConfig, CurrencyCode } from "../types";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import nzhcn from 'nzh/cn';
import { formatAmount } from '../utils';
import type { Subject } from '../types';
import FilterableSelect from '../components/filterable-select.vue';

defineOptions({ name: 'VoucherTableBody' });

const props = defineProps<{
  entries: VoucherEntry[];
  minRows: number;
  disabled: boolean;
  subjectList: Subject[];
  auxiliaryList: Subject[];
  currencyRates?: Partial<Record<CurrencyCode, number>>;
  auxiliaryCategoryLabels?: Record<number, string>;
}>();

const emit = defineEmits<{ (e: 'updateEntry', entries: VoucherEntry[]): void }>();

// 编辑状态与 refs
const isEditing = ref<Record<number, Record<string, boolean>>>({});

// input refs：用于自动聚焦 - 使用 Map 确保可靠性
const subjectRefs = new Map<number, InstanceType<typeof FilterableSelect>>();
const auxiliaryRefs = new Map<string, InstanceType<typeof FilterableSelect>>();
const debitInputs = new Map<number, HTMLInputElement>();
const creditInputs = new Map<number, HTMLInputElement>();
const summaryInputs = new Map<number, HTMLTextAreaElement>();

/**
 * 科目一律按层级全称展示（一级-二级-三级），只留末级可选。
 *
 * 全称只在选择器里用，槽位外的查找（余额、辅助配置、数量/外币判断）仍走原始列表：
 * 那些逻辑只按 id 取字段，换成全称反而看不出是同一个科目。
 */
const subjectOptions = computed(() =>
  props.subjectList
    .filter(subject => Number(subject.hasChildren) !== 1)
    .map(subject => (subject.fullName ? { ...subject, name: subject.fullName } : subject))
);

/**
 * 展示用科目表：可选列表 + 「行里引用了、但已不在可选列表里」的科目。
 *
 * 后者出现在科目被停用之后（`/finance/subject/list` 只返回启用科目），行里存的还是 subjectId；
 * 不补上的话这一格会渲染成空白。它们只进查找表、不进下拉（`subjectOptions`），所以显示得出来但选不到。
 */
const subjectLookup = computed(() => {
  const knownIds = new Set(props.subjectList.map(subject => subject.id));
  const missing = new Map<string, Subject>();
  props.entries.forEach(entry => {
    if (entry.subjectId && !knownIds.has(entry.subjectId) && !missing.has(entry.subjectId)) {
      missing.set(entry.subjectId, {
        id: entry.subjectId,
        code: entry.subjectCode || '',
        // 凭证行自己带着名称与层级全称，直接拿来当展示名
        name: entry.subjectFullName || entry.subjectName || entry.subjectCode || '',
        hasChildren: 0
      });
    }
  });
  const mapped = props.subjectList.map(subject =>
    subject.fullName ? { ...subject, name: subject.fullName } : subject
  );
  return [...mapped, ...missing.values()];
});

function getSubjectAuxiliaries(index: number): SubjectAuxiliaryConfig[] {
  const currentRow = props.entries[index];
  if (!currentRow?.subjectId) {
    return [];
  }
  return props.subjectList.find(item => item.id === currentRow.subjectId)?.auxiliaries || [];
}

// 当前行科目是否启用数量核算
function isQuantitySubject(row: VoucherEntry): boolean {
  if (!row.subjectId) {
    return false;
  }
  return Boolean(props.subjectList.find(item => item.id === row.subjectId)?.quantityAccounting);
}

function isForeignCurrencySubject(row: VoucherEntry): boolean {
  if (!row.subjectId) {
    return false;
  }
  return Boolean(props.subjectList.find(item => item.id === row.subjectId)?.foreignCurrencyEnabled);
}

const currencyOptions: CurrencyCode[] = ['CNY', 'USD', 'HKD', 'JPY', 'EUR', 'GBP'];
function getCurrencyOptions(row: VoucherEntry) {
  const subject = props.subjectList.find(item => item.id === row.subjectId);
  return subject?.foreignCurrencyCodes?.length ? subject.foreignCurrencyCodes : currencyOptions;
}

// 展示精度与账簿/期初一致：汇率 8 位。收窄成 2 位会让界面上的「原币 × 汇率」
// 对不上本币（后端按 4 位校验，见 VoucherEntryValidityPolicy），用户无法在界面上勾稽。
function formatExchangeRate(value: number | string | null | undefined) {
  const rate = Number(value);
  if (!hasDisplayValue(value) || !Number.isFinite(rate)) {
    return '-';
  }
  return rate.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

const currentCurrencyRates = computed(() => ({ CNY: 1, ...props.currencyRates }));

/**
 * 当前行科目的期末余额展示文案。
 *
 * 没有余额数据的科目后端给的是 `null`（不是缺字段），所以这里必须判 null：
 * 只判 undefined 会让 `null ?? 0` 变成「余额：0.00」挂在每一行上。真正的 0 余额照常显示 0.00。
 */
function getSubjectBalanceText(row: VoucherEntry): string {
  const subject = props.subjectList.find(item => item.id === row.subjectId);
  if (!subject || subject.closingBalance === null || subject.closingBalance === undefined) {
    return '';
  }
  return formatAmount(subject.closingBalance, true);
}

/**
 * 科目单元格的完整文案（编码 + 层级全称）。
 * 单元格宽度有限，「银行存款-工商银行」这种长名字会被省略号截掉，悬浮时用它还原全文。
 * 科目已停用（不在 subjectList 里）时回落到凭证行自带的那份。
 */
function subjectCellText(row: VoucherEntry) {
  const subject = props.subjectList.find(item => item.id === row.subjectId);
  if (!subject) {
    return [row.subjectCode, row.subjectFullName || row.subjectName].filter(Boolean).join(' ');
  }
  return [subject.code, subject.fullName || subject.name].filter(Boolean).join(' ');
}

function getEntryAuxiliary(row: VoucherEntry, category: number) {
  return (row.auxiliaries || []).find(item => Number(item.auxiliaryCategory) === Number(category));
}

/** 辅助核算单元格的完整文案（类别：值，用分隔符连起来），供换行截断时悬浮看全 */
function auxiliaryCellText(index: number) {
  const row = props.entries[index];
  if (!row) {
    return '';
  }
  return getSubjectAuxiliaries(index)
    .map(config => {
      const value = getEntryAuxiliary(row, config.auxiliaryCategory)?.auxiliaryName;
      return value ? `${getAuxiliaryCategoryLabel(config.auxiliaryCategory)}：${value}` : '';
    })
    .filter(Boolean)
    .join(' / ');
}

function hasAuxiliarySelection(index: number): boolean {
  return getSubjectAuxiliaries(index).some(config =>
    Boolean(getEntryAuxiliary(props.entries[index], config.auxiliaryCategory)?.auxiliaryId)
  );
}

function getFilteredAuxiliaryOptions(category: number) {
  return props.auxiliaryList.filter(item => Number(item.auxiliaryCategory) === Number(category));
}

// ==================== 辅助核算浮层 ====================
//
// 单元格只做展示，点开一个浮层把该科目配置的维度一次填完：不再靠「逐个自动跳转」串起来，
// 也就不必让每个维度都先变成输入框。

/** 当前打开浮层的行：同一时间只开一个 */
const openAuxiliaryRow = ref<number | null>(null);
const tableWrapperRef = ref<HTMLElement>();
/** 触发浮层的单元格（量它的宽度，好让浮层与单元格等宽） */
const auxiliaryTriggerRefs = new Map<number, HTMLElement>();
/** 浮层宽度＝触发单元格的宽度：列宽由 table-layout:fixed 分配，写死数值在别的窗口宽度下就对不上 */
const auxiliaryPanelWidth = ref(0);

function prepareAuxiliaryPanel(index: number) {
  const trigger = auxiliaryTriggerRefs.get(index);
  if (trigger) {
    auxiliaryPanelWidth.value = Math.round(trigger.getBoundingClientRect().width);
  }
}

/** 面板样式：宽＝触发的单元格，保证「单元格 / 浮层 / 下拉 / 输入框」四者同宽 */
const auxiliaryPanelStyle = computed(() => ({
  width: auxiliaryPanelWidth.value ? `${auxiliaryPanelWidth.value}px` : undefined
}));

function handleAuxiliaryPanelShow(index: number, show: boolean) {
  if (show) {
    prepareAuxiliaryPanel(index);
    openAuxiliaryRow.value = index;
    return;
  }
  if (openAuxiliaryRow.value === index) {
    openAuxiliaryRow.value = null;
  }
}

function handleAuxiliaryTriggerClick(index: number) {
  if (props.disabled || getSubjectAuxiliaries(index).length === 0) {
    return;
  }
  handleAuxiliaryPanelShow(index, openAuxiliaryRow.value !== index);
}

// 浮层直接渲染在单元格里，点空白处由自己收起
function handleDocumentClick(event: MouseEvent) {
  if (openAuxiliaryRow.value === null) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && tableWrapperRef.value?.contains(target) && target.closest('.auxiliary-panel, .auxiliary-display')) {
    return;
  }
  openAuxiliaryRow.value = null;
}

/** 打开浮层并把焦点落到第一个维度上：键盘流选完科目、以及回车走到这里的落点 */
async function openAuxiliaryPanel(index: number) {
  prepareAuxiliaryPanel(index);
  openAuxiliaryRow.value = index;
  // 浮层内容是按需渲染的，等两拍再取 ref 才拿得到里面的选择器
  await nextTick();
  await nextTick();
  const first = getSubjectAuxiliaries(index)[0];
  if (!first) {
    return;
  }
  auxiliaryRefs.get(auxiliaryRefKey(index, first.auxiliaryCategory))?.focus?.();
}

function auxiliaryRefKey(index: number, category: number) {
  return `${index}-${category}`;
}

function getAuxiliaryCategoryLabel(category: number) {
  return props.auxiliaryCategoryLabels?.[category] ?? String(category);
}

function createEmptyEntry(entryNumber: number): VoucherEntry {
  return {
    id: '',
    entryNumber,
    entrySummary: '',
    subjectId: '',
    auxiliaries: [],
    debitAmount: null,
    creditAmount: null
  };
}

// 格式化条目：将金额为0的转换为null
function normalizeEntry(entry: VoucherEntry): VoucherEntry {
  return {
    ...entry,
    debitAmount: entry.debitAmount === 0 ? null : entry.debitAmount,
    creditAmount: entry.creditAmount === 0 ? null : entry.creditAmount
  };
}

function padEntries(entries: VoucherEntry[]) {
  const padded = entries.map(normalizeEntry);
  while (padded.length < props.minRows) {
    padded.push(createEmptyEntry(padded.length + 1));
  }
  return padded.map((entry, idx) => ({ ...entry, entryNumber: idx + 1 }));
}

// 确保最少行数
function ensureMinRows() {
  if (!props.entries || props.entries.length < props.minRows) {
    const paddedEntries = padEntries(props.entries || []);
    emit('updateEntry', paddedEntries);
  }
}

// 监听条目变化，确保最少行数
watch(
  () => props.entries,
  newEntries => {
    if (newEntries && newEntries.length < props.minRows) {
      ensureMinRows();
    }
  },
  { immediate: true, deep: true }
);

/**
 * 切到只读时把已经打开的编辑器一并收起来。
 *
 * `disabled` 是异步来的（结账状态、红冲关系晚于挂载才返回），而摘要的 textarea 在挂载后 100ms
 * 就自动打开了：只拦「进入编辑」拦不住它。等状态回来页面已只读，那个 textarea 却还能输入，
 * 而保存按钮已经隐藏——改了也只会静默丢掉。
 */
watch(
  () => props.disabled,
  disabled => {
    if (!disabled) {
      return;
    }
    isEditing.value = {};
    openAuxiliaryRow.value = null;
  }
);

// 组件挂载时确保最少4行，并自动聚焦第一行摘要
onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);
  ensureMinRows();
  await nextTick();
  // 增加延时确保 DOM 完全渲染和生命周期完成
  setTimeout(() => {
    toggleEdit(0, 'summary');
  }, 100);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});

// 合计计算
const debitTotal = computed(() =>
  props.entries.reduce((sum: number, item: VoucherEntry) => sum + (Number(item.debitAmount) || 0), 0)
);
const creditTotal = computed(() =>
  props.entries.reduce((sum: number, item: VoucherEntry) => sum + (Number(item.creditAmount) || 0), 0)
);

// 大写金额（仅当借贷平衡时返回大写，否则返回空）
const totalInChinese = computed(() => {
  // 容差与保存路径一致（0.01）：原来用 !== 比浮点，差几分钱时大写金额消失、但保存却能过
  if (Math.abs(debitTotal.value - creditTotal.value) > 0.01) {
    return '';
  }
  return nzhcn.toMoney(debitTotal.value);
});

// 行编辑操作：自动聚焦（辅助核算不走这里，它走浮层）
function toggleEdit(index: number, field: 'summary' | 'subject' | 'debit' | 'credit') {
  if (props.disabled) {
    return;
  }
  if (!isEditing.value[index]) {
    isEditing.value[index] = {} as Record<string, boolean>;
  }
  isEditing.value[index][field] = true;
  // 已经在编辑态时也要聚焦：点了别处会失焦但输入框还开着，再点回来必须能接着输入
  nextTick(() => focusEditor(field, index));
}

/** 把焦点交给某个字段的编辑器 */
function focusEditor(field: 'summary' | 'subject' | 'debit' | 'credit', index: number) {
  if (field === 'subject') {
    subjectRefs.get(index)?.focus?.();
    return;
  }
  if (field === 'debit') {
    debitInputs.get(index)?.focus?.();
    return;
  }
  if (field === 'credit') {
    creditInputs.get(index)?.focus?.();
    return;
  }
  summaryInputs.get(index)?.focus?.();
}

/** 金额是否算「没填」：空串、null、0 都算（0 在凭证里与空等价，padEntries 也会归一化成 null） */
function isEmptyAmount(val: unknown) {
  return val === null || val === undefined || val === '' || Number(val) === 0;
}

/** 数量/单价是否值得显示：数量 0 也是有意义的，只有空值不显示 */
function hasDisplayValue(val: unknown) {
  return val !== null && val !== undefined && val !== '';
}

/** 数量核算科目的计量单位，只读展示时跟在数量后面 */
function quantityUnitOf(row: VoucherEntry) {
  return props.subjectList.find(item => item.id === row.subjectId)?.quantityUnit || '';
}

/**
 * 点空行的借方/贷方时补差额：只在借贷两边都没填、且合计还有差额时生效。
 *
 * <p>填的是「点的那一侧追上另一侧」的金额，所以填完必然平。差额为负表示点的那一侧合计已经偏大，
 * 照样把负数填进去（红字冲销就是这么录的），由用户自己看合不合理。
 *
 * @returns 是否真的填了，调用方据此决定要不要全选（好让用户直接输自己的数覆盖掉）
 */
function fillBalancingAmount(index: number, side: 'debitAmount' | 'creditAmount') {
  const row = props.entries[index];
  if (!row || !isEmptyAmount(row.debitAmount) || !isEmptyAmount(row.creditAmount)) {
    return false;
  }
  const raw = side === 'debitAmount' ? creditTotal.value - debitTotal.value : debitTotal.value - creditTotal.value;
  // 与 autoBalanceAmount 同样保留两位：浮点相加会给出 0.30000000000000004 这种尾巴
  const diff = Math.round(raw * 100) / 100;
  if (diff === 0) {
    return false;
  }
  const newEntries = [...props.entries];
  newEntries[index] = { ...newEntries[index], [side]: diff };
  emit('updateEntry', newEntries);
  return true;
}

/** 点金额单元格：先把差额补上（能补的话），再进入编辑态 */
function handleAmountCellClick(index: number, field: 'debit' | 'credit') {
  const filled = fillBalancingAmount(index, field === 'debit' ? 'debitAmount' : 'creditAmount');
  toggleEdit(index, field);
  if (!filled) {
    return;
  }
  // toggleEdit 的 nextTick 里已经 focus，这里排在它后面：全选补上的金额，用户直接输数就是覆盖
  nextTick(() => {
    const el = field === 'debit' ? debitInputs.get(index) : creditInputs.get(index);
    el?.select();
  });
}

function hideInput(index: number, field: string) {
  if (isEditing.value[index]) {
    isEditing.value[index][field] = false;
  }
}

// 科目单元格失焦处理：仅当焦点移出单元格时才退出编辑态（保持数量/单价输入框在聚焦时可见）
function handleSubjectFocusOut(index: number, e: FocusEvent) {
  const related = e.relatedTarget as HTMLElement | null;
  if (!related) {
    return;
  }
  const td = e.currentTarget as HTMLElement;
  if (td.contains(related)) {
    return;
  }
  hideInput(index, 'subject');
}

/* onEntryBlur 已由各处直接使用 hideInput，移除多余封装以满足 lint */

// 新增/删除/更新
function addRow(index: number) {
  const newEntry: VoucherEntry = {
    id: Date.now().toString(),
    entryNumber: index + 2,
    entrySummary: '',
    subjectId: '',
    auxiliaries: [],
    debitAmount: null,
    creditAmount: null
  };
  const current = [...props.entries];
  current.splice(index + 1, 0, newEntry);
  current.forEach((e, i) => (e.entryNumber = i + 1));
  shiftRowIndexedState(index + 1, 1);
  emit('updateEntry', current);
}

/**
 * 行增删后，把「按行号存」的编辑态与输入框 ref 一起挪位。
 *
 * 它们都按 `index` 建索引，而行本身按 id 键控：不挪位的话，删掉第 1 行后第 2 行的「正在编辑」
 * 标记会落到别人的数据上、平白弹出一个金额输入框，ref 也会指错行、回车导航的 `focus()` 打空。
 *
 * @param at 被删除 / 插入的行号
 * @param delta -1 删除、+1 插入
 */
function shiftRowIndexedState(at: number, delta: number) {
  const shift = (key: number) => (key >= at ? key + delta : key);
  isEditing.value = Object.fromEntries(
    Object.entries(isEditing.value).map(([key, value]) => [shift(Number(key)), value])
  );
  const shiftMap = (map: Map<number, any>) => {
    const entries: [number, any][] = [];
    map.forEach((value, key) => {
      const next = shift(key);
      if (next !== at) {
        entries.push([next, value]);
      }
    });
    map.clear();
    entries.forEach(([key, value]) => map.set(key, value));
  };
  shiftMap(subjectRefs);
  shiftMap(debitInputs);
  shiftMap(creditInputs);
  shiftMap(summaryInputs);
  shiftMap(auxiliaryTriggerRefs);
  const shiftedAuxiliaries = new Map<string, InstanceType<typeof FilterableSelect>>();
  auxiliaryRefs.forEach((value, key) => {
    const [rowIndex, category] = key.split('-').map(Number);
    const next = shift(rowIndex);
    if (next !== at) {
      shiftedAuxiliaries.set(`${next}-${category}`, value);
    }
  });
  auxiliaryRefs.clear();
  shiftedAuxiliaries.forEach((value, key) => auxiliaryRefs.set(key, value));
  // 浮层开着的那一行被删/被挪位了，直接收起，免得指向别人的数据
  openAuxiliaryRow.value = null;
}

function removeRow(index: number) {
  const newEntries = props.entries.filter((_, i) => i !== index);
  newEntries.forEach((e, i) => (e.entryNumber = i + 1));
  const paddedEntries = padEntries(newEntries);
  shiftRowIndexedState(index + 1, -1);
  emit('updateEntry', paddedEntries);
}

// 金额输入处理：限制格式并在失焦时格式化、并将对方金额清零；支持空输入显示为空
function handleNumberInput(index: number, key: 'debitAmount' | 'creditAmount', e: Event) {
  const target = e.target as HTMLInputElement;
  const val = target.value;

  // 使用更宽松的策略：提取所有符合格式的字符
  // 1. 先处理负号（只允许开头有一个）
  let result = '';
  if (val.startsWith('-')) {
    result = '-';
  }

  // 2. 提取数字和小数点
  const remaining = val.replace(/^-/, '');
  let hasDecimal = false;
  let decimalCount = 0;

  for (const char of remaining) {
    if (char >= '0' && char <= '9') {
      if (hasDecimal) {
        if (decimalCount < 2) {
          result += char;
          decimalCount += 1;
        }
      } else {
        result += char;
      }
    } else if (char === '.' && !hasDecimal) {
      result += char;
      hasDecimal = true;
    }
  }

  // 更新数据，保持字符串形式以支持输入中间状态（如"-"、"0."）
  const newEntries = [...props.entries];
  newEntries[index] = { ...newEntries[index], [key]: result };
  // 只有在实际输入有效内容时才清空对方金额（不包括空字符串、仅负号、仅小数点等）
  if (result && result !== '-' && result !== '.' && result !== '-.') {
    if (key === 'debitAmount') {
      newEntries[index].creditAmount = null;
    } else {
      newEntries[index].debitAmount = null;
    }
  }
  emit('updateEntry', newEntries);
}

// 自动平衡金额:借方大于贷方时填充贷方,反之填充借方
function autoBalanceAmount(nextIndex: number) {
  const newEntries = [...props.entries];
  const diff = Math.round(Math.abs(debitTotal.value - creditTotal.value) * 100) / 100;

  if (debitTotal.value > creditTotal.value) {
    newEntries[nextIndex].creditAmount = diff;
  } else if (debitTotal.value < creditTotal.value) {
    newEntries[nextIndex].debitAmount = diff;
  }

  emit('updateEntry', newEntries);
}

// 复制当前行摘要到下一行
function copySummaryToNextRow(currentSummary: string | null, nextIndex: number) {
  if (!currentSummary) {
    return;
  }
  const nextRow = props.entries[nextIndex];
  if (!nextRow?.entrySummary) {
    const newEntries = [...props.entries];
    newEntries[nextIndex].entrySummary = currentSummary;
    emit('updateEntry', newEntries);
  }
}

// 处理借方/贷方字段的Enter键
async function handleAmountEnter(params: {
  fieldName: 'debit' | 'credit';
  index: number;
  hasValue: boolean;
  nextIndex: number;
}) {
  const { fieldName, index, hasValue, nextIndex } = params;
  if (!hasValue) {
    // 金额为空,跳转到对应字段
    toggleEdit(index, fieldName === 'debit' ? 'credit' : 'debit');
    return;
  }

  hideInput(index, fieldName);

  const nextRow = props.entries[nextIndex];
  if (!nextRow) {
    return;
  }

  const hasNextAmount = nextRow.debitAmount || nextRow.creditAmount;

  // 如果下一行没有金额且借贷不平衡,自动填充
  if (!hasNextAmount && debitTotal.value !== creditTotal.value) {
    autoBalanceAmount(nextIndex);
  }

  await nextTick();
  toggleEdit(nextIndex, 'summary');
}

// 键盘导航和智能填充逻辑
function focusField(field: 'subject' | 'auxiliary' | 'debit' | 'credit' | 'summary', index: number) {
  if (field === 'auxiliary') {
    openAuxiliaryPanel(index);
    return;
  }
  const refMap = {
    subject: subjectRefs,
    debit: debitInputs,
    credit: creditInputs,
    summary: summaryInputs
  };
  const fieldRef = refMap[field].get(index);
  if (fieldRef?.focus) {
    fieldRef.focus();
  } else {
    toggleEdit(index, field);
  }
}

async function handleEnterKey(field: 'summary' | 'subject' | 'debit' | 'credit', index: number, e?: KeyboardEvent) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const currentRow = props.entries[index];
  if (!currentRow) {
    return;
  }

  const nextIndex = index + 1;
  let nextRow = props.entries[nextIndex];

  if (!nextRow && (field === 'debit' || field === 'credit')) {
    addRow(index);
    await nextTick();
    nextRow = props.entries[nextIndex];
  }

  if ((field === 'debit' || field === 'credit') && nextRow) {
    copySummaryToNextRow(currentRow.entrySummary, nextIndex);
  }

  if (field === 'summary') {
    hideInput(index, 'summary');
    await nextTick();
    focusField('subject', index);
  } else if (field === 'subject') {
    hideInput(index, 'subject');
    const selectedSubject = props.subjectList.find(item => item.id === currentRow.subjectId);
    await nextTick();
    if (selectedSubject?.auxiliaries?.length) {
      focusField('auxiliary', index);
    } else {
      focusField('debit', index);
    }
  } else if (field === 'debit') {
    if (!nextRow) {
      return;
    }
    await handleAmountEnter({
      fieldName: 'debit',
      index,
      hasValue: Boolean(currentRow.debitAmount),
      nextIndex
    });
  } else if (field === 'credit') {
    if (!nextRow) {
      return;
    }
    await handleAmountEnter({
      fieldName: 'credit',
      index,
      hasValue: Boolean(currentRow.creditAmount),
      nextIndex
    });
  }
}

// 金额失焦处理
function handleAmountBlur(index: number, key: 'debitAmount' | 'creditAmount', e: FocusEvent) {
  const target = e.target as HTMLInputElement;
  const val = target?.value ? target.value.trim() : '';

  // 空值、只有负号、只有小数点、负号加小数点，以及 0，都视为 null。
  // 0 必须算「没填」：别处（isEmptyAmount、normalizeEntry、显示判断）都把它当空，
  // 这里若当成有效金额，会在下面把对面的金额清掉——借方差贷方被抹掉、借方自己又显示为空，那笔金额就丢了。
  let num: number | null = null;
  if (val !== '' && val !== '-' && val !== '.' && val !== '-.') {
    const parsed = Number(val);
    if (!Number.isNaN(parsed) && parsed !== 0) {
      num = parsed;
    }
  }

  const newEntries = [...props.entries];
  newEntries[index] = { ...newEntries[index], [key]: num };
  // 只有在实际填入有效金额（非null）时才清空对方金额
  if (num !== null) {
    if (key === 'debitAmount') {
      newEntries[index].creditAmount = null;
    } else {
      newEntries[index].debitAmount = null;
    }
  }
  syncForeignAmountFromLocal(newEntries[index]);
  emit('updateEntry', newEntries);
  // 隐藏对应的输入框（debitAmount -> 'debit', creditAmount -> 'credit'）
  const field = key === 'debitAmount' ? 'debit' : 'credit';
  hideInput(index, field);
}

/** 本币是凭证主金额；已有汇率时，录入本币后自动反算原币。 */
function syncForeignAmountFromLocal(row: VoucherEntry) {
  if (!row.currencyCode) {
    return;
  }
  const rate = Number(row.exchangeRate);
  const localAmount = Number(row.debitAmount ?? row.creditAmount);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(localAmount)) {
    return;
  }
  row.originalAmount = Math.round((localAmount / rate) * 10000) / 10000;
}

function editQuantity(index: number, key: 'quantity' | 'unitPrice', e: MouseEvent) {
  if (props.disabled) {
    return;
  }
  const slot = (e.currentTarget as HTMLElement).parentElement;
  isEditing.value[index] ??= {};
  isEditing.value[index][key] = true;
  nextTick(() => slot?.querySelector('input')?.focus());
}

// 数量/单价失焦处理：解析为数字并提交，空值归一化为 null
function handleQuantityBlur(index: number, key: 'quantity' | 'unitPrice', e: FocusEvent) {
  const target = e.target as HTMLInputElement;
  const val = target?.value ? target.value.trim() : '';

  let num: number | null = null;
  if (val !== '' && val !== '-' && val !== '.' && val !== '-.') {
    const parsed = Number(val);
    if (!Number.isNaN(parsed)) {
      num = parsed;
    }
  }

  const newEntries = [...props.entries];
  newEntries[index] = { ...newEntries[index], [key]: num };
  emit('updateEntry', newEntries);
  hideInput(index, key);
}

function updateCurrencyCode(index: number, e: Event) {
  const currencyCode = ((e.target as HTMLSelectElement).value || null) as CurrencyCode | null;
  const entries = [...props.entries];
  entries[index] = {
    ...entries[index],
    currencyCode,
    // 换币种就换汇率：新币种没配汇率时清空，绝不留着上一个币种的汇率（否则汇率与原币对不上）
    exchangeRate: currencyCode ? (currentCurrencyRates.value[currencyCode] ?? null) : null
  };
  syncForeignAmountFromLocal(entries[index]);
  emit('updateEntry', entries);
}

const formatAndHideCell = (value: number | string | null) => {
  // 返回固定长度（11）的数组，便于在列上对齐
  const EMPTY = Array(11).fill({ visible: false, text: '', isNegative: false });
  if (value === null || value === undefined || value === '') {
    return EMPTY;
  }
  const raw = Number(value);
  if (Number.isNaN(raw) || raw === 0) {
    return EMPTY;
  }

  const isNegative = raw < 0;
  const absFixed = Math.abs(raw).toFixed(2); // 保证有两位小数
  const [intPart, decPart] = absFixed.split('.');
  const combined = (intPart + (decPart || '00')).padStart(11, '0').split('');

  // 将前导零替换为空字符串，直到遇到第一个非零位（保留小数位）
  for (let i = 0; i < combined.length - 2; i += 1) {
    if (combined[i] === '0') {
      combined[i] = '';
    } else {
      break;
    }
  }

  return combined.map(ch => ({ visible: ch !== '', text: ch, isNegative }));
};

// 科目相关处理函数
const handleSubjectChange = async (index: number, code: string) => {
  const selectedSubject = props.subjectList.find(item => item.code === code);
  if (!selectedSubject) {
    return;
  }

  const newEntries = [...props.entries];
  newEntries[index] = {
    ...newEntries[index],
    subjectId: selectedSubject.id,
    auxiliaries: (selectedSubject.auxiliaries || []).map(config => ({
      auxiliaryCategory: Number(config.auxiliaryCategory),
      auxiliaryId: ''
    })),
    currencyCode: selectedSubject.foreignCurrencyEnabled
      ? newEntries[index].currencyCode || selectedSubject.foreignCurrencyCodes?.[0] || 'USD'
      : null,
    originalAmount: selectedSubject.foreignCurrencyEnabled ? newEntries[index].originalAmount : null,
    exchangeRate: selectedSubject.foreignCurrencyEnabled
      ? newEntries[index].exchangeRate ||
        currentCurrencyRates.value[
          newEntries[index].currencyCode || selectedSubject.foreignCurrencyCodes?.[0] || 'USD'
        ] ||
        null
      : null
  };
  emit('updateEntry', newEntries);
  hideInput(index, 'subject');

  // 选择科目后自动跳转，并确保退出输入模式
  await nextTick();
  if (selectedSubject.auxiliaries?.length) {
    openAuxiliaryPanel(index);
  } else {
    toggleEdit(index, 'debit');
  }
};

const handleAuxiliaryChange = async (index: number, code: string, category: number) => {
  const selectedAux = props.auxiliaryList.find(
    item => item.code === code && Number(item.auxiliaryCategory) === Number(category)
  );
  if (!selectedAux) {
    return;
  }

  const newEntries = [...props.entries];
  const auxiliaries = [...(newEntries[index].auxiliaries || [])];
  const auxiliaryIndex = auxiliaries.findIndex(item => Number(item.auxiliaryCategory) === Number(category));
  const value: VoucherEntryAuxiliary = {
    auxiliaryCategory: Number(category),
    auxiliaryId: selectedAux.id,
    auxiliaryCode: selectedAux.code,
    auxiliaryName: selectedAux.name
  };
  if (auxiliaryIndex >= 0) {
    auxiliaries[auxiliaryIndex] = value;
  } else {
    auxiliaries.push(value);
  }
  newEntries[index] = {
    ...newEntries[index],
    auxiliaries
  };
  emit('updateEntry', newEntries);

  // 选完一个自动开启下一个未填维度的下拉：维度之间是连着填的，省得每次再点一下
  await nextTick();
  const following = getSubjectAuxiliaries(index).find(
    config => !getEntryAuxiliary(props.entries[index], config.auxiliaryCategory)?.auxiliaryId
  );
  if (following) {
    auxiliaryRefs.get(auxiliaryRefKey(index, following.auxiliaryCategory))?.focus?.();
    return;
  }
  // 维度都填完了：收起浮层，把焦点交给金额，接着录金额
  openAuxiliaryRow.value = null;
  toggleEdit(index, 'debit');
};

// 计算当前行可选的辅助科目列表
// 辅助函数：根据 ID 获取 Code (用于 Select 绑定)
const getCodeById = (id: string, list: Subject[]) => {
  return list.find(item => item.id === id)?.code || '';
};

// 判断金额是否应该显示
</script>

<template>
  <div ref="tableWrapperRef" class="voucher-table-wrapper">
    <table id="voucherTable" class="voucher-table">
      <thead>
        <tr>
          <th class="th-w-50">序号</th>
          <th class="th-w-260">摘要</th>
          <th class="th-w-260">会计科目</th>
          <th class="th-w-260">辅助核算</th>
          <th class="th-w-220 voucher_debite">
            <strong class="voucher_title">借方金额</strong>
            <div class="voucher_unit">
              <span>亿</span>
              <span>千</span>
              <span>百</span>
              <span>十</span>
              <span>万</span>
              <span>千</span>
              <span>百</span>
              <span>十</span>
              <span>元</span>
              <span>角</span>
              <span>分</span>
            </div>
          </th>
          <th class="th-w-220 voucher_credit">
            <strong class="voucher_title">贷方金额</strong>
            <div class="voucher_unit">
              <span>亿</span>
              <span>千</span>
              <span>百</span>
              <span>十</span>
              <span>万</span>
              <span>千</span>
              <span>百</span>
              <span>十</span>
              <span>元</span>
              <span>角</span>
              <span>分</span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in entries" :key="row.id || index" class="voucher_item">
          <td class="td-index">{{ index + 1 }}</td>
          <!-- 摘要 -->
          <td class="cell-editable" @click="toggleEdit(index, 'summary')">
            <div class="cell-overlay">
              <textarea
                v-show="isEditing[index]?.summary"
                :ref="
                  el => {
                    if (el) summaryInputs.set(index, el as HTMLTextAreaElement);
                    else summaryInputs.delete(index);
                  }
                "
                v-model="row.entrySummary"
                maxlength="80"
                class="cell-absolute textarea-large"
                @blur="hideInput(index, 'summary')"
                @keydown.enter.prevent="e => handleEnterKey('summary', index, e)"
              />
              <!-- 摘要超过三行会被截断，悬浮给全文 -->
              <div v-show="!isEditing[index]?.summary" class="cell-span summary-display" :title="row.entrySummary">
                {{ row.entrySummary }}
              </div>
            </div>
          </td>
          <!-- 科目（数量核算科目的数量/单价内嵌在科目单元格，点击后显示） -->
          <td
            class="cell-editable"
            @click="toggleEdit(index, 'subject')"
            @focusout="handleSubjectFocusOut(index, $event)"
          >
            <div class="cell-overlay subject-cell-overlay">
              <div class="subject-select-wrap">
                <FilterableSelect
                  :ref="
                    el => {
                      if (el) subjectRefs.set(index, el as any);
                      else subjectRefs.delete(index);
                    }
                  "
                  :model-value="getCodeById(row.subjectId, props.subjectList)"
                  :options="subjectOptions"
                  :all-options="subjectLookup"
                  :disabled="props.disabled"
                  :show-code="true"
                  :title="subjectCellText(row)"
                  class="subject-select"
                  @update:model-value="code => handleSubjectChange(index, code)"
                />
              </div>
              <!-- 第二行：数量/单价 + 币种 -->
              <div v-if="isQuantitySubject(row) || isForeignCurrencySubject(row)" class="subject-detail-row">
                <div v-if="isQuantitySubject(row)" class="quantity-group" @click.stop>
                  <!-- 只读：数量和单价是文字，不是输入框 -->
                  <template v-if="props.disabled">
                    <span v-if="hasDisplayValue(row.quantity)" class="inline-readonly" title="数量">
                      {{ row.quantity }}{{ quantityUnitOf(row) ? ` ${quantityUnitOf(row)}` : '' }}
                    </span>
                    <span v-if="hasDisplayValue(row.unitPrice)" class="inline-readonly" title="单价">
                      {{ row.unitPrice }}
                    </span>
                  </template>
                  <template v-else>
                    <span v-for="key in ['quantity', 'unitPrice'] as const" :key="key" class="quantity-field">
                      <input
                        v-if="isEditing[index]?.[key]"
                        v-model="row[key]"
                        type="text"
                        class="quantity-inline-input"
                        :aria-label="key === 'quantity' ? '数量' : '单价'"
                        :placeholder="key === 'quantity' ? '数量' : '单价'"
                        @blur="e => handleQuantityBlur(index, key, e)"
                        @keydown.enter="($event.target as HTMLInputElement).blur()"
                      />
                      <button
                        v-else
                        type="button"
                        class="quantity-display"
                        :class="{ 'quantity-placeholder': !hasDisplayValue(row[key]) }"
                        @click="editQuantity(index, key, $event)"
                      >
                        {{ hasDisplayValue(row[key]) ? row[key] : key === 'quantity' ? '数量' : '单价' }}
                      </button>
                    </span>
                  </template>
                </div>
                <!-- 只读：币种也是文字，不留一个禁用下拉框 -->
                <span v-if="isForeignCurrencySubject(row) && props.disabled" class="inline-readonly">
                  {{ row.currencyCode || '' }}
                </span>
                <select
                  v-else-if="isForeignCurrencySubject(row)"
                  :value="row.currencyCode || ''"
                  class="foreign-currency-select"
                  aria-label="币种"
                  @change="e => updateCurrencyCode(index, e)"
                >
                  <option value="">币种</option>
                  <option v-for="code in getCurrencyOptions(row)" :key="code" :value="code">{{ code }}</option>
                </select>
              </div>
              <!-- 第三行：汇率/原币/余额，贴单元格底部 -->
              <div
                v-if="isForeignCurrencySubject(row) || (!props.disabled && getSubjectBalanceText(row))"
                class="subject-foot-row"
              >
                <span v-if="!props.disabled && getSubjectBalanceText(row)" class="subject-balance">
                  余额：{{ getSubjectBalanceText(row) }}
                </span>
                <div v-if="isForeignCurrencySubject(row)" class="foreign-currency-group">
                  <span class="foreign-currency-label">汇率：</span>
                  <span class="foreign-currency-value">{{ formatExchangeRate(row.exchangeRate) }}</span>
                </div>
              </div>
            </div>
          </td>
          <!-- 辅助科目：单元格只做展示，点开浮层把该科目要的维度一次填完 -->
          <td class="cell-editable">
            <div class="cell-overlay">
              <div
                :ref="
                  el => {
                    if (el) auxiliaryTriggerRefs.set(index, el as HTMLElement);
                    else auxiliaryTriggerRefs.delete(index);
                  }
                "
                class="auxiliary-display"
                :title="auxiliaryCellText(index)"
                @click="handleAuxiliaryTriggerClick(index)"
              >
                <div class="auxiliary-display-inner">
                  <div
                    v-for="config in getSubjectAuxiliaries(index)"
                    v-show="getEntryAuxiliary(row, config.auxiliaryCategory)?.auxiliaryId"
                    :key="config.auxiliaryCategory"
                    class="auxiliary-display-item"
                    :title="`${getAuxiliaryCategoryLabel(config.auxiliaryCategory)}：${getEntryAuxiliary(row, config.auxiliaryCategory)?.auxiliaryName || '请选择'}`"
                  >
                    <span class="auxiliary-display-label">
                      {{ getAuxiliaryCategoryLabel(config.auxiliaryCategory) }}
                    </span>
                    <span class="auxiliary-display-value">
                      {{ getEntryAuxiliary(row, config.auxiliaryCategory)?.auxiliaryName || '' }}
                    </span>
                  </div>
                  <span
                    v-if="!props.disabled && getSubjectAuxiliaries(index).length > 0 && !hasAuxiliarySelection(index)"
                    class="auxiliary-display-placeholder"
                  >
                    请选择
                  </span>
                </div>
              </div>
              <div v-if="openAuxiliaryRow === index" class="auxiliary-panel" :style="auxiliaryPanelStyle">
                <div
                  v-for="config in getSubjectAuxiliaries(index)"
                  :key="config.auxiliaryCategory"
                  class="auxiliary-panel-item"
                >
                  <FilterableSelect
                    :ref="
                      el => {
                        if (el) auxiliaryRefs.set(auxiliaryRefKey(index, config.auxiliaryCategory), el as any);
                        else auxiliaryRefs.delete(auxiliaryRefKey(index, config.auxiliaryCategory));
                      }
                    "
                    :model-value="
                      getCodeById(
                        getEntryAuxiliary(row, config.auxiliaryCategory)?.auxiliaryId || '',
                        props.auxiliaryList
                      )
                    "
                    :options="getFilteredAuxiliaryOptions(config.auxiliaryCategory)"
                    :all-options="props.auxiliaryList"
                    :placeholder="`${getAuxiliaryCategoryLabel(config.auxiliaryCategory)}${config.required ? ' *' : ''}`"
                    class="auxiliary-select"
                    @update:model-value="code => handleAuxiliaryChange(index, code, config.auxiliaryCategory)"
                  />
                </div>
              </div>
            </div>
          </td>
          <!-- 借方金额 -->
          <td class="cell-number cell-editable voucher_debite" @click="handleAmountCellClick(index, 'debit')">
            <div class="cell-overlay">
              <input
                v-show="isEditing[index]?.debit"
                :ref="
                  el => {
                    if (el) debitInputs.set(index, el as HTMLInputElement);
                    else debitInputs.delete(index);
                  }
                "
                v-model="row.debitAmount"
                type="text"
                class="cell-absolute"
                @blur="e => handleAmountBlur(index, 'debitAmount', e)"
                @input="e => handleNumberInput(index, 'debitAmount', e)"
                @keydown.enter="e => handleEnterKey('debit', index, e)"
              />
              <div v-show="!isEditing[index]?.debit" class="cell-span">
                <template
                  v-if="
                    row.debitAmount !== 0 &&
                    row.debitAmount !== null &&
                    row.debitAmount !== undefined &&
                    row.debitAmount !== '' &&
                    row.debitAmount !== '-' &&
                    row.debitAmount !== '.' &&
                    row.debitAmount !== '-.'
                  "
                >
                  <span
                    v-for="(item, n) in formatAndHideCell(row.debitAmount)"
                    :key="n"
                    :style="{ visibility: item.visible ? 'visible' : 'hidden' }"
                    :class="{ 'negative-number': item.isNegative }"
                  >
                    {{ item.text }}
                  </span>
                </template>
              </div>
            </div>
          </td>
          <!-- 贷方金额 -->
          <td class="cell-number cell-editable voucher_credit" @click="handleAmountCellClick(index, 'credit')">
            <div class="cell-overlay">
              <input
                v-show="isEditing[index]?.credit"
                :ref="
                  el => {
                    if (el) creditInputs.set(index, el as HTMLInputElement);
                    else creditInputs.delete(index);
                  }
                "
                v-model="row.creditAmount"
                type="text"
                class="cell-absolute"
                @blur="e => handleAmountBlur(index, 'creditAmount', e)"
                @input="e => handleNumberInput(index, 'creditAmount', e)"
                @keydown.enter="e => handleEnterKey('credit', index, e)"
              />
              <div v-show="!isEditing[index]?.credit" class="cell-span">
                <template
                  v-if="
                    row.creditAmount !== 0 &&
                    row.creditAmount !== null &&
                    row.creditAmount !== undefined &&
                    row.creditAmount !== '' &&
                    row.creditAmount !== '-' &&
                    row.creditAmount !== '.' &&
                    row.creditAmount !== '-.'
                  "
                >
                  <span
                    v-for="(item, n) in formatAndHideCell(row.creditAmount)"
                    :key="n"
                    :style="{ visibility: item.visible ? 'visible' : 'hidden' }"
                    :class="{ 'negative-number': item.isNegative }"
                  >
                    {{ item.text }}
                  </span>
                </template>
              </div>
            </div>
          </td>
          <!-- 删除按钮 -->
          <div v-if="!props.disabled" class="row-action row-action-left" :data-row="index">
            <img src="../assets/add.svg" class="row-action-icon" alt="增加行" @click="addRow(index)" />
          </div>
          <div v-if="!props.disabled" class="row-action row-action-right" :data-row="index">
            <img src="../assets/remove.svg" class="row-action-icon" alt="删除行" @click="removeRow(index)" />
          </div>
        </tr>
      </tbody>
      <tfoot>
        <tr class="table-footer">
          <td colspan="4" class="footer-right">
            <strong>合计：{{ totalInChinese }}</strong>
          </td>
          <td class="cell-number voucher_debite voucher-total">
            <div class="cell-overlay">
              <div class="cell-span">
                <template v-if="debitTotal !== 0">
                  <span
                    v-for="(item, n) in formatAndHideCell(debitTotal)"
                    :key="n"
                    :style="{ visibility: item.visible ? 'visible' : 'hidden' }"
                    :class="{ 'negative-number': item.isNegative }"
                  >
                    {{ item.text }}
                  </span>
                </template>
              </div>
            </div>
          </td>
          <td class="cell-number voucher_credit voucher-total">
            <div class="cell-overlay">
              <div class="cell-span">
                <template v-if="creditTotal !== 0">
                  <span
                    v-for="(item, n) in formatAndHideCell(creditTotal)"
                    :key="n"
                    :style="{ visibility: item.visible ? 'visible' : 'hidden' }"
                    :class="{ 'negative-number': item.isNegative }"
                  >
                    {{ item.text }}
                  </span>
                </template>
              </div>
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.voucher-table-wrapper {
  position: relative;
  width: auto;
  flex: 1 1 auto;
}

.voucher-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;
  position: relative;
}

.voucher-cell-full {
  width: 100%;
  box-sizing: border-box;
}

.cell-overlay {
  position: relative;
  /* 让输入层与展示层完全覆盖单元格 */
  padding: 0;
  height: 88px;
  min-height: 88px;
  max-height: 88px;
  width: 100%;
  box-sizing: border-box;
  overflow: visible;
}

.foreign-currency-group {
  position: relative;
  z-index: 4;
  display: flex;
  gap: 2px;
  align-items: center;
  /* 靠右显示：这一组吃掉剩余宽度，内容再贴到右边缘，不与左边的余额挤在一起 */
  justify-content: flex-end;
  white-space: nowrap;
  width: auto;
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
}

/* 科目单元格第二行与第三行：左右内边距交给内容自理，与科目/余额的 10px 对齐 */
.subject-detail-row,
.subject-foot-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
  padding: 0 10px;
  box-sizing: border-box;
}

/* 第三行贴单元格底部：余额在左、汇率/原币靠右，这一行晚出现/消失都不会挪动科目 */
.subject-foot-row {
  margin-top: auto;
  justify-content: space-between;
}

.subject-detail-row .quantity-group {
  flex: 0 1 150px;
  min-width: 0;
  margin-left: auto;
  gap: 6px;
  padding: 0;
}

.subject-detail-row .quantity-field {
  flex: 1 1 72px;
  width: 72px;
  min-width: 0;
}

.subject-detail-row .quantity-inline-input,
.quantity-display {
  width: 100%;
  text-align: center;
}

.quantity-display {
  display: block;
  height: 20px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: #262626;
  font-size: 12px;
  line-height: 20px;
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quantity-placeholder {
  color: #bfbfbf;
}

.subject-cell-overlay {
  display: flex;
  flex-direction: column;
  /* 顶部起排：科目固定在第一行，下面多出数量/外币/余额行都不会把它挪位 */
  justify-content: flex-start;
  gap: 5px;
  /*
   * 边距对齐摘要单元格（.summary-display 是 padding: 8px 10px）：
   * 科目文字要落在与摘要首行相同的位置。左右不在这里给——科目下拉内部自带 10px 左内边距，
   * 数量/外币行与余额由各自规则补 10px。
   */
  padding: 4px 0 0 0;
}

.subject-cell-overlay .subject-select-wrap {
  min-height: 24px;
}

/* 与「余额」同一字号：这三样都在第三行上，字号不一致会显得不是一组 */
.foreign-currency-label {
  color: #8c8c8c;
  font-size: 12px;
}

.foreign-currency-value {
  min-width: 30px;
  color: #8c8c8c;
  font-size: 12px;
  text-align: right;
}

.foreign-currency-select {
  flex: 0 0 74px;
  min-width: 0;
  height: 20px;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 3px;
  background: #fff;
  padding: 0 4px;
  font-size: 11px;
}

.auxiliary-display {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 10px;
  box-sizing: border-box;
}

.auxiliary-display-inner {
  min-height: 100%;
  display: flex;
  flex-wrap: wrap;
  /* 与摘要、科目一致：从头开始排，不居中 */
  align-content: flex-start;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 3px 8px;
}

.auxiliary-display-item {
  display: flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1.3;
  font-size: 12px;
  max-width: 100%;
  cursor: pointer;
  border-radius: 2px;
  transition: background-color 0.2s ease;
}

.auxiliary-display-item:hover {
  background-color: #f0f7ff;
}

.auxiliary-display-label {
  flex: none;
  color: #8c8c8c;
}

.auxiliary-display-label::after {
  content: ':';
  margin-right: 2px;
}

.auxiliary-display-value {
  color: #262626;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auxiliary-display-placeholder {
  color: #bfbfbf;
  font-size: 13px;
  line-height: 1.5;
}

/*
 * 辅助核算浮层：每个维度一行选择器（维度名走占位符），选完不自动收起。
 * 宽度由 :style 绑定成单元格宽度、锚在单元格底部，这样「单元格 / 浮层 / 下拉 / 输入框」四者同宽。
 */
.auxiliary-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 左右不留内边距、也不画边框：留了里面的输入框就会比单元格窄掉那几像素 */
  padding: 8px 0;
  box-sizing: border-box;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
}

.auxiliary-panel-item {
  display: flex;
  align-items: center;
}

/* min-width: 0 是必须的：面板里它是 flex 项，不给 0 就缩不到剩余宽度以下，会顶出面板 */
.auxiliary-select {
  flex: 1;
  min-width: 0;
  min-height: 28px;
}

.cell-absolute {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  border: 1px solid transparent;
  outline: none;
  padding: 0;
  font-size: inherit;
  box-sizing: border-box;
  z-index: 100; /* 提升z-index以确保下拉框显示在所有内容之上 */
  border-radius: 2px;
  overflow: visible;
  word-wrap: break-word;
  word-break: break-all;
}

.cell-absolute:focus {
  border-color: #409eff;
  box-shadow: none;
}

.subject-cell-overlay {
  display: flex;
  flex-direction: column;
}

.subject-select-wrap {
  /*
   * 固定成第一行的高度：科目不再撑满单元格、也就在单元格里不再居中，
   * 下面多出数量/外币/余额行都不会把它推上推下。
   * 28px 配上 overlay 的 4px 上边距，科目文字落在 8–28px —— 与摘要首行同一条线。
   * 允许轻微收缩，是为了数量行与余额行同时出现时不撑破单元格。
   */
  flex: 0 1 28px;
  position: relative;
}

/* 单元格只有 28px 高，把输入框自身的 8px 上下内边距去掉，编辑时输入的搜索文字才不会被裁 */
.subject-cell-overlay :deep(.select-input) {
  padding: 0 10px;
}

.subject-select {
  width: 100%;
  height: 100%;
}

.quantity-group {
  flex: 0 1 auto;
  height: 20px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

.quantity-foreign-row .quantity-inline-input {
  width: 0;
  flex: 1 1 0;
}

.quantity-inline-input {
  width: 44px;
  height: 20px;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  background: #fff;
  padding: 0 4px;
  font-size: 12px;
  line-height: 18px;
  color: #262626;
  text-align: right;
  box-sizing: border-box;
  background: #f7f8fa;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.quantity-inline-input:hover {
  background: #f0f1f3;
}

.quantity-inline-input:focus {
  border-color: #409eff;
  background: #fff;
  outline: none;
}

.quantity-inline-input:disabled {
  cursor: not-allowed;
  color: #8c8c8c;
}

/* 只读时的数量/单价：跟输入框同一套排版，但没有边框背景 */
.inline-readonly {
  min-width: 0;
  padding: 0 4px;
  font-size: 12px;
  line-height: 18px;
  color: #262626;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quantity-inline-input::placeholder {
  color: #bfbfbf;
}

.subject-balance {
  flex: 0 0 auto;
  padding: 0 4px;
  font-size: 12px;
  line-height: 20px;
  color: #8c8c8c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* select 下拉框样式 */
.cell-select {
  cursor: pointer;
  padding: 8px 10px;
  appearance: auto;
  background-color: #ffffff;
}

.cell-select:focus {
  border-color: #409eff;
  box-shadow: 0 0 4px rgba(64, 158, 255, 0.45);
}

.cell-select option {
  padding: 8px 10px;
}

/* 强制输入与展示层填满 overlay，去除默认 margin/padding/border */
.cell-absolute input,
.cell-absolute textarea {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  box-sizing: border-box;
  font-size: inherit;
  line-height: 1.35;
}

.cell-span {
  pointer-events: none;
  user-select: none;
  color: inherit;
  background: transparent;
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0; /* 内边距由 overlay 控制 */
  box-sizing: border-box;
  z-index: 1;
  white-space: nowrap;
}

.cell-span > span {
  display: inline-block;
  width: calc(100% / 11);
  text-align: center;
  font-family: monospace;
  box-sizing: border-box;
}

.voucher-table th {
  border: 1px solid #f0f0f0;
  padding: 12px;
  font-weight: 600;
  text-align: center;
  color: #595959;
  font-size: 14px;
  background: #ffffff;
}

.voucher-table td {
  border: 1px solid #f0f0f0;
  padding: 10px;
  height: 40px;
  transition: all 0.3s ease;
  background: #ffffff;
}

.table-row:hover {
  background-color: #fafbfc;
}

.table-row:hover td {
  background-color: #fafbfc;
}

.cell-center {
  text-align: center;
}

.cell-number {
  text-align: right;
  padding-right: 10px;
}

.cell-editable {
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
}

.cell-editable:hover {
  background-color: transparent !important;
}

.cell-editable input:not(.cell-absolute),
.cell-editable textarea:not(.cell-absolute) {
  width: 100%;
  border: 1px solid #91d5ff;
  padding: 8px;
  box-sizing: border-box;
  border-radius: 4px;
  transition: all 0.3s ease;
  background: #ffffff;
}

.cell-editable input:not(.cell-absolute):focus,
.cell-editable textarea:not(.cell-absolute):focus {
  outline: none;
  border-color: #69c0ff;
  box-shadow: none;
}

.voucher-table td.cell-editable {
  padding: 0;
  height: 88px;
  min-height: 88px;
  max-height: 88px;
  overflow: visible;
}

.voucher-table td.cell-editable .cell-overlay,
.voucher-table td.cell-editable .cell-span,
.voucher-table td.cell-editable .cell-absolute,
.voucher-table td.cell-editable textarea,
.voucher-table td.cell-editable input {
  height: 100%;
  max-height: 88px;
  overflow: visible;
}

.table-footer {
  background: #fefbf7;
  font-weight: 600;
}

.table-footer td {
  background: #fefbf7;
  border-top: 1px solid #f0f0f0;
  color: #262626;
  font-size: 14px;
}

.footer-right {
  text-align: left;
  padding-left: 10px;
}

button {
  background: #ffffff;
  border: 1px solid #e8e8e8;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  transition: all 0.3s ease;
  color: #595959;
}

button:hover {
  border-color: #91d5ff;
  color: #40a9ff;
  background: #f0f8ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(145, 213, 255, 0.2);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 从父组件迁移的凭证表格相关样式 */
.voucher_title {
  display: block;
  height: 40px;
  font-size: 14px;
  font-weight: 700;
  line-height: 40px;
  background: none;
  color: #262626;
  text-align: center;
  letter-spacing: 2px;
}

.voucher_unit {
  width: 220px;
  height: 25px;
  line-height: 25px;
  font-weight: 700;
  border-top: 1px solid #dadada;
  display: flex;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  text-align: center;
  background-image: url(../assets/money_column.svg);
  background-repeat: repeat-y;
  background-position: center top;
  background-size: 100% auto;
}
.voucher_unit span {
  flex: 1 1 0;
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}
.voucher_credit span,
.voucher_debite span {
  font-size: 14px;
  font-weight: 900;
}

/* 只放大分录行里的金额本身；表头刻度、合计行保持原字号 */
.voucher-table tbody td.voucher_debite .cell-span span,
.voucher-table tbody td.voucher_credit .cell-span span {
  font-size: 16px;
}

.voucher-table th.voucher_debite,
.voucher-table th.voucher_credit,
.voucher-table td.voucher_debite,
.voucher-table td.voucher_credit {
  padding: 0;
}

.voucher-table td.voucher_debite .cell-overlay,
.voucher-table td.voucher_credit .cell-overlay {
  padding: 0;
}

.voucher-table td.voucher_debite .cell-span,
.voucher-table td.voucher_credit .cell-span {
  padding: 0;
  background-image: url(../assets/money_column.svg);
  background-repeat: repeat-y;
  background-position: center top;
  background-size: 100% auto;
}

.voucher_summary > div {
  margin-left: 10px;
}

.voucher_subject div:nth-child(2) {
  text-align: left;
  margin-left: 10px;
  width: 200px;
}
.voucher_subject div:last-child {
  position: absolute;
  left: 20.5rem;
  width: 50px;
  top: 50%;
  transform: translateY(-50%);
}

.voucher_total {
  position: relative;
  letter-spacing: 1px;
}
.voucher_total div:first-child {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
}
.voucher_total div:last-child {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.voucher_item {
  padding-left: 10px;
  position: relative;
}

.row-action {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.row-action.row-action-left {
  left: -30px;
}

.row-action.row-action-right {
  right: -30px;
}

.voucher_item:hover .row-action {
  opacity: 1;
}

.row-action-icon {
  font-size: 20px;
  color: #bfbfbf;
  transition:
    transform 0.3s ease,
    color 0.3s ease;
  cursor: pointer;
  display: inline-block;
  padding: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: brightness(0.7);
}

.row-action-icon:hover {
  transform: scale(1.25);
  color: #69c0ff;
  background: #f0f8ff;
  box-shadow: 0 2px 6px rgba(105, 192, 255, 0.25);
  filter: brightness(1);
}

.negative-number {
  color: #ff7875;
  font-weight: 500;
}

.icon-hover {
  font-size: 20px;
  transition:
    transform 0.3s ease,
    color 0.3s ease;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.icon-hover:hover {
  transform: scale(1.2);
  color: #69c0ff;
  background: #f0f8ff;
  box-shadow: 0 2px 6px rgba(105, 192, 255, 0.25);
}

.subject-text {
  width: 100%;
  height: 100%;
  max-height: 88px;
  overflow: hidden;
  overflow-y: auto;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
  padding: 8px 10px;
  box-sizing: border-box;
}

.summary-display {
  width: 100%;
  height: 100%;
  min-height: 88px;
  padding: 8px 10px;
  overflow: hidden;
  overflow-y: auto;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 20.5px;
  box-sizing: border-box;
}

.debit-input-222 {
  width: 222px;
  height: 88px;
}
.row-height-60 {
  height: 60px;
}
.td-w-35 {
  width: 35px;
}
.th-w-50 {
  width: 50px;
}
.th-w-200 {
  width: 200px;
}
.th-w-220 {
  width: 220px;
}
.th-w-260 {
  width: 260px;
}

.td-index {
  text-align: center;
}

.textarea-large {
  height: 100%;
  max-height: 88px;
  min-height: 0;
  resize: none;
  line-height: 1.35;
  overflow: auto;
  padding: 8px 10px;
  word-wrap: break-word;
  word-break: break-all;
}
</style>
