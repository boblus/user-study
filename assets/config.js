/**
 * 应用配置
 * 
 * 使用前请填入你的 Supabase 项目信息
 */

const CONFIG = {
    // Supabase 配置
    SUPABASE_URL: 'https://ctbsnpivzybqmfbtvzbb.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0YnNucGl2enlicW1mYnR2emJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODk1ODYsImV4cCI6MjA4Mzg2NTU4Nn0.nVbv6xhP4Po-7SLkqqVVW35O1LC4uJDI98z7ZSDJXcw',
    
    // 后端类型: 'local' 或 'supabase'
    BACKEND_TYPE: 'supabase',
    
    // Edge Function URL (自动基于 SUPABASE_URL 生成)
    get EDGE_FUNCTION_URL() {
        return `${this.SUPABASE_URL}/functions/v1/rapid-task`;
    },
    
    // Multiple candidates 配置
    // 可以修改为 [0.2, 0.5, 0.8] 等来生成更多 candidates
    CANDIDATE_TEMPERATURES: [0.2, 0.6]
};
