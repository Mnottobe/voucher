# voucher

Vue 3 中文记账凭证组件，MIT 开源。

支持凭证与模板编辑、只读展示、科目搜索、辅助核算、数量核算、外币金额、借贷合计与人民币大写金额。汇率与字典由宿主提供，组件不请求业务接口。

## 本地运行

需要 Node.js 24+ 和 pnpm。

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

`demo/` 提供可编辑示例，`dist/` 输出 ESM、类型声明与样式。发布前请先构建；项目当前尚未发布到 npm。

## 接入

安装本地项目并引入构建产物：

```sh
pnpm add ../voucher
pnpm add vue
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Voucher } from 'voucher';
import type { Subject, VoucherForm, VoucherTemplate } from 'voucher';
import 'voucher/style.css';

const data = ref<VoucherForm | VoucherTemplate>({
  id: '', voucherNumber: 1, attachmentCount: 0, voucherSource: 1,
  voucherDate: Date.now(), voucherEntryList: []
});
const subjects: Subject[] = [{ id: '1002', code: '1002', name: '银行存款' }];
</script>

<template>
  <Voucher v-model:data="data" :is-template="false" :subject-list="subjects" />
</template>
```

| 属性 | 说明 | 默认值 |
| --- | --- | --- |
| `data` / `update:data` | 凭证或模板数据，支持 `v-model:data` | 必填 |
| `isTemplate` | 是否为模板 | 必填 |
| `subjectList` | 科目、辅助核算配置、数量与外币配置 | `[]` |
| `auxiliaryList` | 辅助项目列表，通过 `auxiliaryCategory` 关联 | `[]` |
| `currencyRates` | 币种到汇率的映射；CNY 默认 1，其他币种缺失时不填汇率 | 可选 |
| `auxiliaryCategoryLabels` | 辅助类别编号到名称的映射；缺失时显示编号 | 可选 |
| `currentPeriod` | 会计期间展示文本 | `''` |
| `disabled` | 只读 | `false` |
| `minRows` | 最少分录行数 | `4` |

完整公开类型见 `src/types.ts`。宿主负责加载科目、汇率与辅助项目，监听数据变化并保存；权限、结账限制、打印、附件和后端记账校验由宿主实现。表单沿用原组件约 1350px 的凭证布局，窄屏请使用可横向滚动容器。当前文案为中文。

## 开发与贡献

提交改动前执行 `pnpm typecheck` 与 `pnpm build`，并在演示页检查编辑、只读及相关键盘交互。请勿提交真实账务数据、环境变量或凭据。

## 来源与许可

本项目为独立的开源组件，保留 MIT 版权声明，见 [LICENSE](LICENSE)。不包含任何应用的登录、后端接口、环境文件或数据库。
