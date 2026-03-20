-- Supabase 数据库 Schema
-- 在 Supabase SQL Editor 中运行此文件

-- 先删除旧表（如果存在）
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS questionnaire;
DROP TABLE IF EXISTS task_state;

-- 1. 任务状态表（保存草稿、进度等）
CREATE TABLE task_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant_id TEXT NOT NULL,
    task_index INTEGER NOT NULL,
    started BOOLEAN DEFAULT FALSE,
    submitted BOOLEAN DEFAULT FALSE,
    questionnaire_done BOOLEAN DEFAULT FALSE,
    draft_text TEXT,
    final_review TEXT,
    collab_rounds JSONB DEFAULT '[]',
    judgment TEXT,
    key_point_sketch TEXT,
    task_start_timestamp TIMESTAMP WITH TIME ZONE,
    writing_start_timestamp TIMESTAMP WITH TIME ZONE,
    submit_timestamp TIMESTAMP WITH TIME ZONE,
    pause_timestamps JSONB DEFAULT '[]',
    resume_timestamps JSONB DEFAULT '[]',
    last_saved TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(participant_id, task_index)
);

-- 2. 问卷表
CREATE TABLE questionnaire (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant_id TEXT NOT NULL,
    task_index INTEGER NOT NULL,
    effort INTEGER,
    postedit_effort INTEGER,
    confidence INTEGER,
    satisfaction INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(participant_id, task_index)
);

-- 3. 事件日志表
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    participant_id TEXT NOT NULL,
    task_index INTEGER,
    paper_id TEXT,
    paradigm TEXT,
    round_id INTEGER,
    event_type TEXT NOT NULL,
    payload JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 Row Level Security
ALTER TABLE task_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- 允许匿名访问（因为没有用户认证系统）
CREATE POLICY "Allow all" ON task_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON questionnaire FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON events FOR ALL USING (true) WITH CHECK (true);

-- 创建索引提升查询性能
CREATE INDEX idx_task_state_participant ON task_state(participant_id);
CREATE INDEX idx_questionnaire_participant ON questionnaire(participant_id);
CREATE INDEX idx_events_participant ON events(participant_id);
CREATE INDEX idx_events_timestamp ON events(timestamp);
