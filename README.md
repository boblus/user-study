# 同行评议生成研究 - Web界面

这是一个轻量级的Web应用，用于进行同行评议生成的用户研究。该应用比较三种不同的评议生成范式：从头开始（Scratch）、端到端+后编辑（E2E）和协作模式（Collab）。

## 功能特性

- **单页应用（SPA）**：使用hash路由，适合GitHub Pages部署
- **三种范式支持**：
  - Scratch：参与者从头开始撰写完整评议
  - E2E：参与者编辑AI生成的初稿
  - Collab：参与者与模型多轮交互，接受/拒绝每轮输出
- **自动保存**：每15秒自动保存草稿，刷新后自动恢复
- **事件日志**：记录所有关键操作（开始任务、开始写作、接受/拒绝、提交等）
- **数据导出**：导出所有数据为JSON格式
- **可扩展架构**：设计支持从LocalStorage切换到Supabase后端

## 文件结构

```
user-study/
├── index.html                 # 主HTML文件（包含所有视图）
├── assets/
│   ├── styles.css            # 样式文件
│   ├── app.js                # 主应用逻辑和路由
│   ├── backend.js             # 数据后端抽象层
│   ├── csv.js                # CSV解析工具
│   └── collab_simulator.js   # 协作模式模拟器（MVP）
├── participants.csv          # 参与者分配和任务顺序
├── e2e_reviews.json          # E2E模式的AI生成初稿
├── pdfs/                     # 论文PDF文件
│   ├── paper_1.pdf
│   ├── paper_2.pdf
│   └── ...
└── README.md                 # 本文件
```

## 本地运行

### 方法1：使用Python HTTP服务器

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

然后在浏览器中访问 `http://localhost:8000`

### 方法2：使用Node.js http-server

```bash
# 安装http-server（如果尚未安装）
npm install -g http-server

# 运行服务器
http-server -p 8000
```

然后在浏览器中访问 `http://localhost:8000`

### 方法3：使用VS Code Live Server

如果使用VS Code，可以安装"Live Server"扩展，然后右键点击`index.html`选择"Open with Live Server"。

## 部署到GitHub Pages

1. **创建GitHub仓库**：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/user-study.git
   git push -u origin main
   ```

2. **启用GitHub Pages**：
   - 进入仓库的Settings页面
   - 找到"Pages"部分
   - 选择Source为"main"分支（或"master"）
   - 选择"/ (root)"文件夹
   - 点击Save

3. **访问应用**：
   应用将在 `https://yourusername.github.io/user-study/` 可用

## participants.csv 格式

CSV文件必须包含以下列：

```csv
participant_id,task_1,task_2,task_3,task_1_paper,task_2_paper,task_3_paper
p01a,scratch,e2e,collab,paper_1,paper_2,paper_3
p02b,scratch,collab,e2e,paper_1,paper_2,paper_3
...
```

- `participant_id`: 参与者唯一标识符（也是登录令牌）
- `task_1`, `task_2`, `task_3`: 每个任务的范式（`scratch`, `e2e`, 或 `collab`）
- `task_1_paper`, `task_2_paper`, `task_3_paper`: 每个任务对应的论文ID

## e2e_reviews.json 格式

JSON文件包含论文ID到AI生成初稿的映射：

```json
{
  "paper_1": "这是针对paper_1的AI生成评议初稿...",
  "paper_2": "这是针对paper_2的AI生成评议初稿...",
  ...
}
```

## PDF文件

将所有论文PDF文件放在`pdfs/`文件夹中，文件名格式为`{paper_id}.pdf`，例如：
- `pdfs/paper_1.pdf`
- `pdfs/paper_2.pdf`
- `pdfs/paper_3.pdf`

## 数据导出

参与者可以在概览页面或完成页面点击"导出数据 (JSON)"按钮，下载包含以下内容的数据文件：

- 参与者分配信息
- 任务状态和草稿
- 最终提交的评议
- 问卷响应
- 所有事件日志

导出的JSON文件格式：
```json
{
  "exportTimestamp": "2024-01-01T12:00:00.000Z",
  "participantToken": "p01a",
  "assignment": {
    "participantId": "p01a",
    "tasks": [...]
  },
  "state": {
    "currentTaskIndex": 1,
    "tasks": {
      "1": {
        "started": true,
        "taskStartTimestamp": "...",
        "draftText": "...",
        ...
      }
    }
  },
  "events": [...]
}
```

## 切换到Supabase后端

当前应用使用LocalStorage后端（MVP）。要切换到Supabase：

1. **设置Supabase项目**：
   - 创建Supabase项目
   - 创建所需的数据表（参见`assets/backend.js`中的注释）

2. **修改后端**：
   在`assets/backend.js`中，将：
   ```javascript
   const backend = new LocalStorageBackend();
   ```
   改为：
   ```javascript
   const backend = new SupabaseBackend();
   ```

3. **配置Supabase客户端**：
   在`SupabaseBackend`构造函数中初始化Supabase客户端：
   ```javascript
   import { createClient } from '@supabase/supabase-js';
   this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   ```

4. **实现Supabase方法**：
   按照`assets/backend.js`中的TODO注释实现所有方法

5. **设置Edge Function（用于LLM调用）**：
   - 创建Supabase Edge Function用于生成评议
   - 在`assets/collab_simulator.js`中替换模拟调用为真实API调用

## 开发说明

### 路由系统

应用使用hash路由（`#/login`, `#/overview`等）。路由处理在`assets/app.js`的`handleRoute()`函数中。

### 状态管理

所有状态存储在localStorage（MVP）或Supabase（生产环境）中。状态结构包括：
- 当前任务索引
- 每个任务的状态（开始时间、草稿、提交时间等）
- 协作模式的轮次历史

### 自动保存

任务页面每15秒自动保存草稿。编辑器输入时也会触发延迟保存（500ms延迟）。

### 事件日志

所有关键操作都会记录为事件，包括：
- `start_task`: 开始任务
- `start_writing`: 开始写作
- `accept`: 接受协作轮次
- `reject`: 拒绝协作轮次
- `submit_review`: 提交评议
- `submit_post_task_questionnaire`: 提交问卷

## 浏览器兼容性

- Chrome/Edge (推荐)
- Firefox
- Safari
- 需要支持ES6+和localStorage

## 许可证

本项目仅供研究使用。

