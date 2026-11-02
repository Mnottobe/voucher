<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

defineOptions({ name: 'FilterableSelect' });

interface Option {
  code: string;
  name: string;
  [key: string]: any;
}

interface Props {
  modelValue: string; // 绑定 code
  options: Option[]; // 下拉显示的选项列表
  allOptions?: Option[]; // 用于查找显示值的完整列表（可选，如果不提供则用 options）
  placeholder?: string;
  label?: string; // 类别前缀标签（如辅助核算类别名）
  /** 只读：只展示当前值，不接受焦点、不弹下拉、不派发选择 */
  disabled?: boolean;
  /**
   * 展示态是否带上编码，形如「1001 库存现金」。
   *
   * 科目要带（与凭证列表、账簿的科目全称口径一致），辅助核算不带——辅助项目名字本来就短，
   * 编码只会占地方。
   */
  showCode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  label: '',
  allOptions: () => [],
  disabled: false,
  showCode: false
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'blur'): void;
}>();

const searchInput = ref('');
const showDropdown = ref(false);
const selectRef = ref<HTMLElement>();
const inputRef = ref<HTMLInputElement>();
const zIndex = ref(10000);
const activeIndex = ref(-1);

// 全局z-index管理
let globalZIndex = 10000;

// 获取当前选中项的展示文案
const selectedOptionName = computed(() => {
  // 优先从 allOptions（查找列表）中查找，否则从 options 中查找
  const lookupList = props.allOptions || props.options;
  const found = lookupList.find(item => item.code === props.modelValue);
  if (!found) {
    return '';
  }
  // 与后端 FinancePeriodUtil.concatFullName 同口径：编码与名称谁缺就只留另一个
  return props.showCode ? [found.code, found.name].filter(Boolean).join(' ') : found.name;
});

// 过滤选项（基于输入的搜索文本）
const filteredOptions = computed(() => {
  if (!searchInput.value) {
    return props.options;
  }
  return props.options.filter(item => item.name.includes(searchInput.value) || item.code.includes(searchInput.value));
});

const handleSelect = (option: Option) => {
  if (props.disabled) {
    return;
  }
  // 更新 v-model 为 code
  emit('update:modelValue', option.code);
  showDropdown.value = false;
  searchInput.value = '';
  activeIndex.value = -1;
  // 选择后失去焦点。
  // 这里不再 emit 'enter'：那条路会让鼠标点选也走一遍键盘的回车导航，
  // 与父组件在 update:modelValue 里做的跳转重复，两边抢焦点。
  nextTick(() => {
    inputRef.value?.blur();
    emit('blur');
  });
};

const handleInputFocus = () => {
  if (props.disabled) {
    return;
  }
  globalZIndex += 1;
  zIndex.value = globalZIndex;
  showDropdown.value = true;
  // 获得焦点时清空搜索，让用户可以重新搜索
  searchInput.value = '';
  activeIndex.value = filteredOptions.value.findIndex(opt => opt.code === props.modelValue);
  nextTick(() => {
    inputRef.value?.focus();
  });
};

const handleInputChange = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  searchInput.value = value;
  showDropdown.value = true;
  activeIndex.value = filteredOptions.value.length > 0 ? 0 : -1;
};

const handleInputBlur = () => {
  // 不需要延迟，直接关闭
  showDropdown.value = false;
  searchInput.value = '';
  activeIndex.value = -1;
  emit('blur');
};

const dropdownRef = ref<HTMLElement>();
const scrollToActive = () => {
  nextTick(() => {
    if (dropdownRef.value && activeIndex.value >= 0) {
      const activeEl = dropdownRef.value.children[activeIndex.value] as HTMLElement;
      if (activeEl) {
        const dropdown = dropdownRef.value;
        const offsetTop = activeEl.offsetTop;
        const offsetHeight = activeEl.offsetHeight;
        const dropdownScrollTop = dropdown.scrollTop;
        const dropdownHeight = dropdown.clientHeight;

        if (offsetTop < dropdownScrollTop) {
          dropdown.scrollTop = offsetTop;
        } else if (offsetTop + offsetHeight > dropdownScrollTop + dropdownHeight) {
          dropdown.scrollTop = offsetTop + offsetHeight - dropdownHeight;
        }
      }
    }
  });
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // 回车时，如果有激活项，选择激活项
    if (activeIndex.value >= 0 && activeIndex.value < filteredOptions.value.length) {
      handleSelect(filteredOptions.value[activeIndex.value]);
    } else if (filteredOptions.value.length === 1) {
      // 如果没有显式激活但只有一个过滤结果，自动选择
      handleSelect(filteredOptions.value[0]);
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!showDropdown.value) {
      handleInputFocus();
    } else if (filteredOptions.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % filteredOptions.value.length;
      scrollToActive();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (showDropdown.value && filteredOptions.value.length > 0) {
      activeIndex.value = (activeIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length;
      scrollToActive();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    showDropdown.value = false;
    searchInput.value = '';
    activeIndex.value = -1;
    inputRef.value?.blur();
  }
};

const handleClickOutside = (e: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(e.target as Node)) {
    showDropdown.value = false;
    searchInput.value = '';
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// 暴露 focus 方法，用于从父组件获得焦点
defineExpose({
  focus: () => {
    if (!props.disabled) {
      handleInputFocus();
    }
  }
});
</script>

<template>
  <div
    ref="selectRef"
    class="filterable-select"
    :class="[{ 'is-disabled': props.disabled }, $attrs.class]"
    :style="{ zIndex: showDropdown ? zIndex : 'auto' }"
  >
    <div class="select-input-wrapper">
      <div v-if="selectedOptionName" class="select-display-text" :class="{ 'is-searching': showDropdown }">
        <span class="select-display-name">
          <span v-if="props.label" class="select-display-label">{{ props.label }}</span>
          {{ selectedOptionName }}
        </span>
      </div>
      <input
        ref="inputRef"
        :value="searchInput"
        type="text"
        class="select-input"
        :disabled="props.disabled"
        :placeholder="selectedOptionName ? '' : props.placeholder"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        @input="handleInputChange"
        @keydown="handleKeydown"
      />
      <span v-if="!props.disabled" class="select-arrow" :class="{ open: showDropdown }">▼</span>
    </div>

    <div v-if="showDropdown" ref="dropdownRef" class="select-dropdown" :style="{ zIndex: zIndex }">
      <div v-if="filteredOptions.length === 0" class="select-empty">暂无选项</div>
      <div
        v-for="(option, idx) in filteredOptions"
        :key="option.code"
        class="select-option"
        :class="{ active: option.code === props.modelValue, highlighted: idx === activeIndex }"
        @mousedown.prevent
        @click.stop="handleSelect(option)"
      >
        <span class="option-name">{{ option.name }}</span>
        <span class="option-code">{{ option.code }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filterable-select {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.select-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  /* border-box：否则那 1px 透明边框会叠在 100% 之外，输入框比下拉宽出 2px */
  box-sizing: border-box;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.select-input {
  flex: 1;
  /* input 的固有宽度约 20 字符，min-width:auto 会让它缩不到可用宽度以下、把外层撑破 */
  min-width: 0;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  padding: 8px 10px;
  font-size: inherit;
  background: transparent;
  box-sizing: border-box;
}

.select-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.filterable-select.is-disabled .select-input-wrapper {
  cursor: default;
  background: transparent;
}

/* 只读态没有箭头，显示文案不必再给它留位置 */
.filterable-select.is-disabled .select-display-text {
  right: 10px;
}

.select-display-text {
  position: absolute;
  left: 10px;
  right: 25px;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4px 0;
  overflow: hidden;
  pointer-events: none;
  color: #333;
  transition: all 0.2s;
}

.select-display-text.is-searching {
  color: #ccc;
  opacity: 0.5;
}

.select-display-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 20px;
}

.select-display-label {
  color: #8c8c8c;
}

.select-display-label::after {
  content: ':';
  margin-right: 4px;
}

.select-arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  height: 20px;
  line-height: 20px;
  font-size: 12px;
  color: #8c8c8c;
  pointer-events: none;
  transition: transform 0.3s ease;
}

.select-arrow.open {
  transform: translateY(-50%) rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 250px;
  overflow-y: auto;
  /* 下拉与输入框同宽，长选项在内部省略，不横向溢出 */
  overflow-x: hidden;
}

.select-empty {
  padding: 12px;
  text-align: center;
  color: #8c8c8c;
  font-size: 12px;
}

.select-option {
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.select-option:hover,
.select-option.highlighted {
  background-color: #f5f5f5;
}

.select-option.active {
  background-color: #e6f7ff;
  border-left: 3px solid #1890ff;
  padding-left: 7px;
}

/* min-width: 0 才收得住长名字：flex 项的自动最小宽度是内容宽度，不收就会把下拉撑得比输入框宽 */
.option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: #262626;
}

.option-code {
  font-size: 12px;
  color: #8c8c8c;
  white-space: nowrap;
}

/* 滚动条样式 */
.select-dropdown::-webkit-scrollbar {
  width: 6px;
}

.select-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.select-dropdown::-webkit-scrollbar-thumb {
  background: #d9d9d9;
  border-radius: 3px;
}

.select-dropdown::-webkit-scrollbar-thumb:hover {
  background: #b3b3b3;
}
</style>
