/**
 * 数据后端抽象层
 * 支持LocalStorageBackend（MVP）和SupabaseBackend（生产环境）
 */

/**
 * 数据后端接口定义
 * 所有后端实现必须实现这些方法
 */
class DataBackend {
    async loadParticipantsCSV() {
        throw new Error('未实现');
    }

    async getAssignment(token) {
        throw new Error('未实现');
    }

    async getCurrentState(token) {
        throw new Error('未实现');
    }

    async saveState(token, taskIndex, state) {
        throw new Error('未实现');
    }

    async appendEvent(event) {
        throw new Error('未实现');
    }

    async saveFinalReview(token, taskIndex, review, timestamps) {
        throw new Error('未实现');
    }

    async saveQuestionnaire(token, taskIndex, responses) {
        throw new Error('未实现');
    }

    async exportAllData(token) {
        throw new Error('未实现');
    }
}

/**
 * LocalStorage后端实现（MVP）
 * 所有数据存储在浏览器localStorage中
 */
class LocalStorageBackend extends DataBackend {
    constructor() {
        super();
        this.participantsData = null;
        this.e2eReviews = null;
    }

    /**
     * 加载participants.csv
     */
    async loadParticipantsCSV() {
        if (this.participantsData) {
            return this.participantsData;
        }

        try {
            const data = await CSVParser.loadFromURL('participants.csv');
            this.participantsData = data;
            return data;
        } catch (error) {
            console.error('加载participants.csv失败:', error);
            throw error;
        }
    }

    /**
     * 加载e2e_reviews.json
     */
    async loadE2EReviews() {
        if (this.e2eReviews) {
            return this.e2eReviews;
        }

        try {
            const response = await fetch('e2e_reviews.json');
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            this.e2eReviews = await response.json();
            return this.e2eReviews;
        } catch (error) {
            console.error('加载e2e_reviews.json失败:', error);
            throw error;
        }
    }

    /**
     * 根据token获取参与者分配
     */
    async getAssignment(token) {
        const participants = await this.loadParticipantsCSV();
        const participant = participants.find(p => p.participant_id === token);
        
        if (!participant) {
            return null;
        }

        // Build tasks array dynamically, only including tasks that exist
        const tasks = [];
        for (let i = 1; i <= 10; i++) {  // Support up to 10 tasks
            const paradigm = participant[`task_${i}`];
            const paperId = participant[`task_${i}_paper`];
            if (paradigm && paperId) {
                tasks.push({
                    index: i,
                    paradigm: paradigm,
                    paperId: paperId
                });
            }
        }

        return {
            participantId: participant.participant_id,
            tasks: tasks
        };
    }

    /**
     * 获取当前状态
     */
    async getCurrentState(token) {
        const key = `participant_${token}`;
        const stateJson = localStorage.getItem(key);
        
        if (!stateJson) {
            return {
                currentTaskIndex: null,
                tasks: {}
            };
        }

        return JSON.parse(stateJson);
    }

    /**
     * 保存状态
     */
    async saveState(token, taskIndex, state) {
        const key = `participant_${token}`;
        const currentState = await this.getCurrentState(token);
        
        currentState.tasks[taskIndex] = {
            ...currentState.tasks[taskIndex],
            ...state,
            lastSaved: new Date().toISOString()
        };

        if (!currentState.currentTaskIndex || 
            this.getTaskStatus(currentState, currentState.currentTaskIndex) !== 'QUESTIONNAIRE_DONE') {
            currentState.currentTaskIndex = taskIndex;
        }

        localStorage.setItem(key, JSON.stringify(currentState));
    }

    /**
     * 获取任务状态
     */
    getTaskStatus(state, taskIndex) {
        const task = state.tasks[taskIndex];
        if (!task) return 'NOT_STARTED';
        if (task.questionnaireDone) return 'QUESTIONNAIRE_DONE';
        if (task.submitted) return 'SUBMITTED';
        if (task.started) return 'IN_PROGRESS';
        return 'NOT_STARTED';
    }

    /**
     * 追加事件日志
     */
    async appendEvent(event) {
        const key = `events_${event.participant_token || event.participant_id}`;
        const eventsJson = localStorage.getItem(key);
        const events = eventsJson ? JSON.parse(eventsJson) : [];
        
        events.push({
            ...event,
            timestamp: event.timestamp || new Date().toISOString()
        });

        localStorage.setItem(key, JSON.stringify(events));
    }

    /**
     * 保存最终评议
     */
    async saveFinalReview(token, taskIndex, review, timestamps) {
        const state = await this.getCurrentState(token);
        await this.saveState(token, taskIndex, {
            ...state.tasks[taskIndex],
            finalReview: review,
            submitted: true,
            submitTimestamp: timestamps.submitTimestamp,
            taskStartTimestamp: timestamps.taskStartTimestamp,
            writingStartTimestamp: timestamps.writingStartTimestamp
        });
    }

    /**
     * 保存问卷响应
     */
    async saveQuestionnaire(token, taskIndex, responses) {
        const state = await this.getCurrentState(token);
        await this.saveState(token, taskIndex, {
            ...state.tasks[taskIndex],
            questionnaire: responses,
            questionnaireDone: true,
            questionnaireTimestamp: new Date().toISOString()
        });
    }

    /**
     * 导出所有数据
     */
    async exportAllData(token) {
        const assignment = await this.getAssignment(token);
        const state = await this.getCurrentState(token);
        
        const eventsKey = `events_${token}`;
        const eventsJson = localStorage.getItem(eventsKey);
        const events = eventsJson ? JSON.parse(eventsJson) : [];

        return {
            exportTimestamp: new Date().toISOString(),
            participantToken: token,
            assignment,
            state,
            events
        };
    }
}

/**
 * Supabase后端实现（生产环境）
 * 数据存储在 Supabase，participants.csv 和 e2e_reviews.json 仍从本地读取
 */
class SupabaseBackend extends DataBackend {
    constructor() {
        super();
        this.participantsData = null;
        this.e2eReviews = null;
        
        // 初始化 Supabase 客户端
        if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
            console.error('请在 config.js 中配置 SUPABASE_URL 和 SUPABASE_ANON_KEY');
            return;
        }
        
        this.supabaseUrl = CONFIG.SUPABASE_URL;
        this.supabaseKey = CONFIG.SUPABASE_ANON_KEY;
    }

    /**
     * 发送 Supabase REST API 请求
     */
    async supabaseRequest(table, method = 'GET', body = null, query = '') {
        const url = `${this.supabaseUrl}/rest/v1/${table}${query}`;
        const headers = {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
        };

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Supabase error: ${response.status} ${errorText}`);
        }

        if (method === 'GET' || method === 'POST') {
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        }
        return null;
    }

    /**
     * 加载participants.csv（从本地文件）
     */
    async loadParticipantsCSV() {
        if (this.participantsData) {
            return this.participantsData;
        }

        try {
            const data = await CSVParser.loadFromURL('participants.csv');
            this.participantsData = data;
            return data;
        } catch (error) {
            console.error('加载participants.csv失败:', error);
            throw error;
        }
    }

    /**
     * 加载e2e_reviews.json（从本地文件）
     */
    async loadE2EReviews() {
        if (this.e2eReviews) {
            return this.e2eReviews;
        }

        try {
            const response = await fetch('e2e_reviews.json');
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            this.e2eReviews = await response.json();
            return this.e2eReviews;
        } catch (error) {
            console.error('加载e2e_reviews.json失败:', error);
            throw error;
        }
    }

    /**
     * 根据token获取参与者分配（从本地 CSV）
     */
    async getAssignment(token) {
        const participants = await this.loadParticipantsCSV();
        const participant = participants.find(p => p.participant_id === token);
        
        if (!participant) {
            return null;
        }

        // Build tasks array dynamically, only including tasks that exist
        const tasks = [];
        for (let i = 1; i <= 10; i++) {  // Support up to 10 tasks
            const paradigm = participant[`task_${i}`];
            const paperId = participant[`task_${i}_paper`];
            if (paradigm && paperId) {
                tasks.push({
                    index: i,
                    paradigm: paradigm,
                    paperId: paperId
                });
            }
        }

        return {
            participantId: participant.participant_id,
            tasks: tasks
        };
    }

    /**
     * 获取当前状态（从 Supabase）
     */
    async getCurrentState(token) {
        try {
            const query = `?participant_id=eq.${encodeURIComponent(token)}`;
            const taskStates = await this.supabaseRequest('task_state', 'GET', null, query);
            
            const state = {
                currentTaskIndex: null,
                tasks: {}
            };

            if (taskStates && taskStates.length > 0) {
                for (const ts of taskStates) {
                    state.tasks[ts.task_index] = {
                        started: ts.started,
                        submitted: ts.submitted,
                        questionnaireDone: ts.questionnaire_done,
                        draftText: ts.draft_text,
                        finalReview: ts.final_review,
                        collabRounds: ts.collab_rounds || [],
                        judgment: ts.judgment,
                        keyPointSketch: ts.key_point_sketch,
                        taskStartTimestamp: ts.task_start_timestamp,
                        writingStartTimestamp: ts.writing_start_timestamp,
                        submitTimestamp: ts.submit_timestamp,
                        pauseTimestamps: ts.pause_timestamps || [],
                        resumeTimestamps: ts.resume_timestamps || [],
                        lastSaved: ts.last_saved
                    };
                    
                    // 确定当前任务索引
                    if (ts.started && !ts.questionnaire_done) {
                        state.currentTaskIndex = ts.task_index;
                    }
                }
            }

            return state;
        } catch (error) {
            console.error('获取状态失败:', error);
            // 返回空状态而不是抛出错误
            return { currentTaskIndex: null, tasks: {} };
        }
    }

    /**
     * 保存状态（到 Supabase）
     */
    async saveState(token, taskIndex, state) {
        try {
            // 检查是否已存在
            const query = `?participant_id=eq.${encodeURIComponent(token)}&task_index=eq.${taskIndex}`;
            const existing = await this.supabaseRequest('task_state', 'GET', null, query);
            
            const data = {
                participant_id: token,
                task_index: taskIndex,
                started: state.started ?? existing?.[0]?.started ?? false,
                submitted: state.submitted ?? existing?.[0]?.submitted ?? false,
                questionnaire_done: state.questionnaireDone ?? existing?.[0]?.questionnaire_done ?? false,
                draft_text: state.draftText ?? existing?.[0]?.draft_text,
                final_review: state.finalReview ?? existing?.[0]?.final_review,
                collab_rounds: state.collabRounds ?? existing?.[0]?.collab_rounds ?? [],
                judgment: state.judgment ?? existing?.[0]?.judgment,
                key_point_sketch: state.keyPointSketch ?? existing?.[0]?.key_point_sketch,
                task_start_timestamp: state.taskStartTimestamp ?? existing?.[0]?.task_start_timestamp,
                writing_start_timestamp: state.writingStartTimestamp ?? existing?.[0]?.writing_start_timestamp,
                submit_timestamp: state.submitTimestamp ?? existing?.[0]?.submit_timestamp,
                pause_timestamps: state.pauseTimestamps ?? existing?.[0]?.pause_timestamps ?? [],
                resume_timestamps: state.resumeTimestamps ?? existing?.[0]?.resume_timestamps ?? [],
                last_saved: new Date().toISOString()
            };

            if (existing && existing.length > 0) {
                // 更新
                await this.supabaseRequest('task_state', 'PATCH', data, query);
            } else {
                // 插入
                await this.supabaseRequest('task_state', 'POST', data);
            }
        } catch (error) {
            console.error('保存状态失败:', error);
            throw error;
        }
    }

    /**
     * 获取任务状态
     */
    getTaskStatus(state, taskIndex) {
        const task = state.tasks[taskIndex];
        if (!task) return 'NOT_STARTED';
        if (task.questionnaireDone) return 'QUESTIONNAIRE_DONE';
        if (task.submitted) return 'SUBMITTED';
        if (task.started) return 'IN_PROGRESS';
        return 'NOT_STARTED';
    }

    /**
     * 追加事件日志（到 Supabase）
     */
    async appendEvent(event) {
        try {
            const data = {
                participant_id: event.participant_token || event.participant_id,
                task_index: event.task_index,
                paper_id: event.paper_id,
                paradigm: event.paradigm,
                round_id: event.round_id,
                event_type: event.event_type,
                payload: event.payload,
                timestamp: event.timestamp || new Date().toISOString()
            };

            await this.supabaseRequest('events', 'POST', data);
        } catch (error) {
            console.error('记录事件失败:', error);
            // 不抛出错误，避免影响主流程
        }
    }

    /**
     * 保存最终评议
     */
    async saveFinalReview(token, taskIndex, review, timestamps) {
        await this.saveState(token, taskIndex, {
            finalReview: review,
            submitted: true,
            submitTimestamp: timestamps.submitTimestamp,
            taskStartTimestamp: timestamps.taskStartTimestamp,
            writingStartTimestamp: timestamps.writingStartTimestamp
        });
    }

    /**
     * 保存问卷响应（到 Supabase）
     */
    async saveQuestionnaire(token, taskIndex, responses) {
        try {
            // 检查是否已存在
            const query = `?participant_id=eq.${encodeURIComponent(token)}&task_index=eq.${taskIndex}`;
            const existing = await this.supabaseRequest('questionnaire', 'GET', null, query);
            
            const data = {
                participant_id: token,
                task_index: taskIndex,
                effort: responses.effort,
                postedit_effort: responses.postedit_effort,
                confidence: responses.confidence,
                satisfaction: responses.satisfaction,
                timestamp: new Date().toISOString()
            };

            if (existing && existing.length > 0) {
                await this.supabaseRequest('questionnaire', 'PATCH', data, query);
            } else {
                await this.supabaseRequest('questionnaire', 'POST', data);
            }

            // 更新任务状态
            await this.saveState(token, taskIndex, {
                questionnaireDone: true
            });
        } catch (error) {
            console.error('保存问卷失败:', error);
            throw error;
        }
    }

    /**
     * 导出所有数据
     */
    async exportAllData(token) {
        const assignment = await this.getAssignment(token);
        const state = await this.getCurrentState(token);
        
        // 获取事件
        const eventsQuery = `?participant_id=eq.${encodeURIComponent(token)}&order=timestamp.asc`;
        const events = await this.supabaseRequest('events', 'GET', null, eventsQuery);

        // 获取问卷
        const questionnaireQuery = `?participant_id=eq.${encodeURIComponent(token)}`;
        const questionnaires = await this.supabaseRequest('questionnaire', 'GET', null, questionnaireQuery);

        return {
            exportTimestamp: new Date().toISOString(),
            participantToken: token,
            assignment,
            state,
            events: events || [],
            questionnaires: questionnaires || []
        };
    }
}

// 根据配置选择后端
let backend;
if (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_TYPE === 'supabase') {
    backend = new SupabaseBackend();
    console.log('Using Supabase backend');
} else {
    backend = new LocalStorageBackend();
    console.log('Using LocalStorage backend');
}
