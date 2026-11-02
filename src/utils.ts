/**
 * 格式化金额显示（千分位，保留 2 位小数）
 * @param val 金额
 * @param showZero 是否显示 0.00，默认为 false（不显示）
 */
export function formatAmount(val: string | number | null | undefined, showZero = false) {
  if (val === null || val === undefined || (Number(val) === 0 && !showZero)) {
    return '';
  }
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

