<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import dayjs from 'dayjs';

defineOptions({ name: 'CustomDatePicker' });

interface Props {
  modelValue: string | number;
  type?: 'date' | 'month';
  min?: string;
  max?: string;
  disabled?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: string | number): void;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'date',
  min: '',
  max: '',
  disabled: false
});

const emit = defineEmits<Emits>();

// 格式转换函数
const convertToDateString = (value: string | number): string => {
  const str = String(value);
  if (props.type === 'month') {
    // yyyyMM 格式 转换为 YYYY-MM
    if (str.length === 6 && /^\d{6}$/.test(str)) {
      return `${str.substring(0, 4)}-${str.substring(4, 6)}`;
    }
  }
  // yyyyMMDD 格式 转换为 YYYY-MM-DD
  if (str.length === 8 && /^\d{8}$/.test(str)) {
    return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
  }
  return str;
};

const convertFromDateString = (dateStr: string): string | number => {
  if (props.type === 'month') {
    // YYYY-MM 转换为 yyyyMM 数字格式
    return Number.parseInt(dateStr.replace(/-/g, ''), 10);
  }
  // YYYY-MM-DD 转换为 yyyyMMDD 数字格式
  return Number.parseInt(dateStr.replace(/-/g, ''), 10);
};

const showPicker = ref(false);
const pickerRef = ref<HTMLElement>();
const currentDate = ref(dayjs());
const currentMonth = ref(dayjs());

// 处理点击外部关闭选择器
const handleClickOutside = (event: MouseEvent) => {
  if (pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
    showPicker.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// 当前展示的年月日

// 日期选择模式下的日期列表
const daysInMonth = computed(() => {
  const firstDay = currentDate.value.startOf('month');
  const lastDay = currentDate.value.endOf('month');
  const daysArray = [];

  // 前月补充天数
  const startWeek = firstDay.day();
  for (let i = startWeek - 1; i >= 0; i -= 1) {
    daysArray.push({
      day: firstDay.subtract(i + 1, 'day').date(),
      isCurrentMonth: false,
      date: firstDay.subtract(i + 1, 'day').format('YYYY-MM-DD')
    });
  }

  // 当月天数
  for (let i = 1; i <= lastDay.date(); i += 1) {
    daysArray.push({
      day: i,
      isCurrentMonth: true,
      date: currentDate.value.date(i).format('YYYY-MM-DD')
    });
  }

  // 下月补充天数
  const remainingDays = 42 - daysArray.length; // 6 rows * 7 days
  for (let i = 1; i <= remainingDays; i += 1) {
    daysArray.push({
      day: i,
      isCurrentMonth: false,
      date: lastDay.add(i, 'day').format('YYYY-MM-DD')
    });
  }

  return daysArray;
});

// 月份选择列表
const monthsInYear = computed(() => {
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const date = currentMonth.value.month(i);
    months.push({
      month: i,
      label: date.format('MMM'),
      fullLabel: date.format('MMMM'),
      value: date.format('YYYY-MM')
    });
  }
  return months;
});

// 获取显示的值
const displayValue = computed(() => {
  const dateStr = convertToDateString(props.modelValue);
  if (!dateStr) {
    return props.type === 'month' ? '选择月份' : '选择日期';
  }
  if (props.type === 'month') {
    return dayjs(dateStr).format('YYYY年MM月');
  }
  return dayjs(dateStr).format('YYYY年MM月DD日');
});

// 检查是否可选（基于 min 和 max 限制）
const isDateDisabled = (dateStr: string) => {
  const date = dayjs(dateStr);
  if (props.min && date.isBefore(dayjs(props.min), 'day')) {
    return true;
  }
  if (props.max && date.isAfter(dayjs(props.max), 'day')) {
    return true;
  }
  return false;
};

const isMonthDisabled = (monthStr: string) => {
  if (!props.min) {
    return false;
  }
  return dayjs(monthStr).isBefore(dayjs(props.min), 'month');
};

// 是否是选中的日期
const isDateSelected = (dateStr: string) => {
  return convertToDateString(props.modelValue) === dateStr;
};

const isMonthSelected = (monthStr: string) => {
  return convertToDateString(props.modelValue) === monthStr;
};

// 事件处理
const handleSelectDate = (dateStr: string) => {
  if (isDateDisabled(dateStr)) {
    return;
  }
  emit('update:modelValue', convertFromDateString(dateStr));
  showPicker.value = false;
};

const handleSelectMonth = (monthStr: string) => {
  if (isMonthDisabled(monthStr)) {
    return;
  }
  emit('update:modelValue', convertFromDateString(monthStr));
  showPicker.value = false;
};

const handlePrevMonth = () => {
  currentDate.value = currentDate.value.subtract(1, 'month');
};

const handleNextMonth = () => {
  currentDate.value = currentDate.value.add(1, 'month');
};

const handlePrevYear = () => {
  currentMonth.value = currentMonth.value.subtract(1, 'year');
};

const handleNextYear = () => {
  currentMonth.value = currentMonth.value.add(1, 'year');
};

const handleToday = () => {
  const today = dayjs().format('YYYY-MM-DD');
  if (!isDateDisabled(today)) {
    handleSelectDate(today);
  }
};

const handleCurrentMonth = () => {
  const currentMonthStr = dayjs().format('YYYY-MM');
  if (!isMonthDisabled(currentMonthStr)) {
    handleSelectMonth(currentMonthStr);
  }
};

// 初始化显示值
const initDisplay = () => {
  const dateStr = convertToDateString(props.modelValue);
  if (dateStr) {
    if (props.type === 'month') {
      currentMonth.value = dayjs(dateStr);
    } else {
      currentDate.value = dayjs(dateStr);
    }
  }
};

initDisplay();
</script>

<template>
  <div ref="pickerRef" class="custom-date-picker">
    <div class="picker-input" :class="{ 'picker-disabled': disabled }" @click="showPicker = !showPicker">
      <span class="input-text">{{ displayValue }}</span>
    </div>

    <div v-if="showPicker" class="picker-dropdown" :class="{ 'picker-type-month': type === 'month' }">
      <!-- 日期选择模式 -->
      <template v-if="type === 'date'">
        <div class="picker-header">
          <button class="nav-btn" @click="handlePrevMonth">‹</button>
          <div class="header-title">{{ currentDate.format('YYYY年MM月') }}</div>
          <button class="nav-btn" @click="handleNextMonth">›</button>
        </div>

        <div class="weekdays">
          <div class="weekday">日</div>
          <div class="weekday">一</div>
          <div class="weekday">二</div>
          <div class="weekday">三</div>
          <div class="weekday">四</div>
          <div class="weekday">五</div>
          <div class="weekday">六</div>
        </div>

        <div class="days-grid">
          <button
            v-for="item in daysInMonth"
            :key="item.date"
            class="day-btn"
            :class="{
              'day-other-month': !item.isCurrentMonth,
              'day-disabled': isDateDisabled(item.date),
              'day-selected': isDateSelected(item.date)
            }"
            :disabled="isDateDisabled(item.date) || !item.isCurrentMonth"
            @click="handleSelectDate(item.date)"
          >
            {{ item.day }}
          </button>
        </div>

        <div class="picker-footer">
          <button class="footer-btn" @click="handleToday">今天</button>
          <button class="footer-btn" @click="showPicker = false">关闭</button>
        </div>
      </template>

      <!-- 月份选择模式 -->
      <template v-else>
        <div class="picker-header">
          <button class="nav-btn" @click="handlePrevYear">‹</button>
          <div class="header-title">{{ currentMonth.format('YYYY年') }}</div>
          <button class="nav-btn" @click="handleNextYear">›</button>
        </div>

        <div class="months-grid">
          <button
            v-for="item in monthsInYear"
            :key="item.value"
            class="month-btn"
            :class="{
              'month-disabled': isMonthDisabled(item.value),
              'month-selected': isMonthSelected(item.value)
            }"
            :disabled="isMonthDisabled(item.value)"
            @click="handleSelectMonth(item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="picker-footer">
          <button class="footer-btn" @click="handleCurrentMonth">本月</button>
          <button class="footer-btn" @click="showPicker = false">关闭</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.custom-date-picker {
  position: relative;
  display: inline-block;
  width: 100%;
}

.picker-input {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fafafa;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.picker-input:hover {
  border-color: #40a9ff;
  background: #ffffff;
}

.picker-input:focus {
  outline: none;
  border-color: #1890ff;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.picker-disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
  pointer-events: none;
}

.input-text {
  flex: 1;
  color: #262626;
}

.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  padding: 8px;
  min-width: 280px;
}

.picker-type-month {
  min-width: 250px;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.header-title {
  font-size: 14px;
  font-weight: 500;
  color: #262626;
  flex: 1;
  text-align: center;
}

.nav-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #e8e8e8;
  background: #fafafa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  border-color: #40a9ff;
  background: #ffffff;
  color: #1890ff;
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.weekday {
  text-align: center;
  font-size: 12px;
  color: #999;
  font-weight: 500;
  height: 24px;
  line-height: 24px;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.day-btn {
  height: 28px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.day-btn:hover:not(.day-disabled):not(.day-other-month) {
  background: #f5f5f5;
  border-color: #e8e8e8;
}

.day-other-month {
  color: #ccc;
}

.day-disabled {
  color: #ccc;
  cursor: not-allowed;
  opacity: 0.5;
}

.day-selected {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
  font-weight: 500;
}

.months-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.month-btn {
  height: 40px;
  border: 1px solid #e8e8e8;
  background: #fafafa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.month-btn:hover:not(.month-disabled) {
  border-color: #40a9ff;
  background: #f0f5ff;
}

.month-disabled {
  color: #ccc;
  cursor: not-allowed;
  opacity: 0.5;
}

.month-selected {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
  font-weight: 500;
}

.picker-footer {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  justify-content: flex-end;
}

.footer-btn {
  padding: 4px 12px;
  border: 1px solid #e8e8e8;
  background: #fafafa;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.footer-btn:hover {
  border-color: #40a9ff;
  background: #f0f5ff;
  color: #1890ff;
}
</style>
