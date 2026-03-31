# Supabase 部署指南

## 1. 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 并登录
2. 点击 "New Project" 创建新项目
3. 记录下项目信息：
   - **Project URL**: `https://YOUR_PROJECT_ID.supabase.co`
   - **Anon Key**: 在 Settings > API 中找到

## 2. 创建数据库表

1. 进入 Supabase Dashboard
2. 点击左侧 "SQL Editor"
3. 复制 `schema.sql` 的内容并运行

## 3. 部署 Edge Function

### 方式 1：通过 Supabase CLI（推荐）

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接到你的项目
supabase link --project-ref YOUR_PROJECT_ID

# 设置环境变量（Groq API Key）
supabase secrets set API_KEY=your-groq-api-key

# 部署 Edge Function
supabase functions deploy generate-review
```

### 方式 2：通过 Dashboard

1. 进入 Supabase Dashboard > Edge Functions
2. 点击 "New Function"
3. 函数名称：`generate-review`
4. 复制 `functions/generate-review/index.ts` 的内容
5. 在 Settings > Secrets 中添加 `API_KEY`（你的 Groq API key）

## 4. 配置前端

编辑 `assets/config.js`：

```javascript
const CONFIG = {
    SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',
    BACKEND_TYPE: 'supabase',  // 改为 'supabase' 启用
};
```

## 5. 准备 Paper 内容

编辑本地的 `papers.json` 文件，填入每篇 paper 的完整文本：

```json
{
    "paper_1": "完整的 paper 1 文本内容...",
    "paper_2": "完整的 paper 2 文本内容...",
    "paper_3": "完整的 paper 3 文本内容..."
}
```

**注意**：Paper 内容始终从本地 `papers.json` 读取，方便随时编辑。

## 6. 测试

1. 打开浏览器开发者工具的 Console
2. 刷新页面，应该看到 "Using Supabase backend"
3. 使用一个测试用户登录
4. 测试 collaborative 任务的生成功能

## 文件说明

```
supabase/
├── README.md              # 本文件
├── schema.sql             # 数据库表结构（task_state, questionnaire, events）
└── functions/
    └── generate-review/
        └── index.ts       # Edge Function 代码

本地文件（不上传到 Supabase）:
├── papers.json            # Paper 文本内容
├── participants.csv       # 参与者分配
└── e2e_reviews.json       # E2E 预生成的 reviews
```

## 数据流

1. **参与者信息** - 从本地 `participants.csv` 读取
2. **Paper 内容** - 从本地 `papers.json` 读取
3. **E2E Reviews** - 从本地 `e2e_reviews.json` 读取
4. **任务状态/问卷/事件** - 保存到 Supabase

## 环境变量

Edge Function 需要设置：
- `API_KEY` - Groq API Key

## 切换回本地模式

如果需要切换回本地模式（使用 localStorage），修改 `assets/config.js`：

```javascript
BACKEND_TYPE: 'local',
```
