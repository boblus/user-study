/**
 * 协作模式 - LLM 调用
 * 
 * 支持两种模式：
 * - 本地模拟（BACKEND_TYPE = 'local'）
 * - Supabase Edge Function（BACKEND_TYPE = 'supabase'）
 * 
 * Paper 内容始终从本地 papers.json 读取
 */

class CollabSimulator {
    static papersData = null;

    /**
     * 加载本地 papers.json
     */
    static async loadPapers() {
        if (this.papersData) {
            return this.papersData;
        }

        try {
            const response = await fetch('papers.json');
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            this.papersData = await response.json();
            return this.papersData;
        } catch (error) {
            console.error('加载 papers.json 失败:', error);
            throw error;
        }
    }

    /**
     * 获取 paper 内容
     */
    static async getPaperContent(paperId) {
        const papers = await this.loadPapers();
        return papers[paperId] || null;
    }

    /**
     * 生成一轮 review
     * 
     * @param {string} paperId - 论文ID
     * @param {Array<Object>} previousRounds - 之前的轮次历史
     * @param {string} judgment - 用户的判断
     * @param {string} feedback - 上一轮的反馈（如果被拒绝）
     * @param {number} temperature - 生成温度 (默认 0.7)
     * @returns {Promise<string>} 生成的 review
     */
    static async generateRound(paperId, previousRounds = [], judgment = '', feedback = '', temperature = 0.7) {
        // 从本地读取 paper 内容
        const paperContent = await this.getPaperContent(paperId);
        if (!paperContent) {
            throw new Error(`Paper ${paperId} not found in papers.json`);
        }

        // 根据配置选择调用方式
        if (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_TYPE === 'supabase') {
            return await this.callEdgeFunction(paperId, paperContent, previousRounds, judgment, feedback, temperature);
        } else {
            return await this.simulateGeneration(paperId, paperContent, previousRounds, judgment, feedback, temperature);
        }
    }

    /**
     * 生成多个 candidates（并行调用）
     * 
     * @param {string} paperId - 论文ID
     * @param {Array<Object>} previousRounds - 之前的轮次历史
     * @param {string} judgment - 用户的判断
     * @param {string} feedback - 上一轮的反馈（如果被拒绝）
     * @param {Array<number>} temperatures - 温度数组（默认从 CONFIG 读取）
     * @returns {Promise<Array<{output: string, temperature: number}>>} candidates 数组
     */
    static async generateMultipleCandidates(paperId, previousRounds = [], judgment = '', feedback = '', temperatures = null) {
        // 使用配置中的 temperatures 或默认值
        const temps = temperatures || (typeof CONFIG !== 'undefined' && CONFIG.CANDIDATE_TEMPERATURES) || [0.3, 0.9];
        
        // 并行调用生成
        const promises = temps.map(async (temp) => {
            const output = await this.generateRound(paperId, previousRounds, judgment, feedback, temp);
            return { output, temperature: temp };
        });
        
        return Promise.all(promises);
    }

    /**
     * 调用 Supabase Edge Function（生产环境）
     */
    static async callEdgeFunction(paperId, paperContent, previousRounds, judgment, feedback, temperature = 0.7) {
        if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) {
            throw new Error('请在 config.js 中配置 SUPABASE_URL');
        }

        const url = CONFIG.EDGE_FUNCTION_URL;
        console.log('Calling Edge Function:', url);
        console.log('Request payload:', { paperId, paperContentLength: paperContent?.length, previousRounds, judgment, feedback, temperature });
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    paperId,
                    paperContent,  // 从本地读取的 paper 内容
                    previousRounds,
                    judgment,
                    feedback,
                    temperature
                })
            });

            console.log('Response status:', response.status);
            
            const responseText = await response.text();
            console.log('Response body:', responseText);
            
            if (!response.ok) {
                let errorMsg = `HTTP error: ${response.status}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMsg = errorData.error || errorData.details || errorMsg;
                } catch (e) {
                    errorMsg = responseText || errorMsg;
                }
                throw new Error(errorMsg);
            }

            const data = JSON.parse(responseText);
            if (!data.review) {
                throw new Error('Response missing review field');
            }
            return data.review;
        } catch (error) {
            console.error('Edge Function 调用失败:', error);
            throw error;
        }
    }

    /**
     * 本地模拟生成（开发/测试用）
     */
    static async simulateGeneration(paperId, paperContent, previousRounds, judgment, feedback, temperature = 0.7) {
        // 模拟 API 延迟
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

        const roundNumber = previousRounds.length + 1;
        
        let review = '';
        
        if (previousRounds.length === 0) {
            // 第一轮：基于 paper 和 judgment 生成
            review = `[Simulated Review - Round ${roundNumber}]

Based on paper "${paperId}" and your judgment:
"${judgment}"

Here is the generated peer review:

**Summary:**
This paper presents an interesting approach to the problem domain. The authors have made several contributions that merit discussion.

**Strengths:**
1. The methodology is well-structured and clearly presented
2. The experimental setup appears comprehensive
3. The results show promising improvements over baselines

**Weaknesses:**
1. Some assumptions may need further justification
2. Additional ablation studies could strengthen the claims
3. The related work section could be more comprehensive

**Questions:**
- How does the method scale to larger datasets?
- What are the computational requirements?

**Overall Assessment:**
The paper makes a solid contribution to the field, though some aspects could be improved before publication.`;
        } else {
            // 后续轮次：基于之前的生成和新的 judgment/feedback
            const lastRound = previousRounds[previousRounds.length - 1];
            
            review = `[Simulated Review - Round ${roundNumber}]

Based on your ${feedback ? 'feedback' : 'new judgment'}:
"${feedback || judgment}"

Here is the refined peer review:

**Revised Summary:**
Taking into account the feedback from the previous round, this revised review addresses the concerns raised.

**Updated Assessment:**
${lastRound.status === 'rejected' ? 
`The previous review has been modified based on your feedback. Key changes include:
- More specific comments on methodology
- Clearer articulation of strengths and weaknesses
- Additional suggestions for improvement` :
`Building upon the accepted previous round, this review adds:
- Deeper analysis of experimental results
- More constructive suggestions
- Better integration of your judgment`}

**Key Points:**
${judgment ? `Your judgment "${judgment}" has been incorporated into this assessment.` : ''}
${feedback ? `Your feedback "${feedback}" has been addressed.` : ''}

**Conclusion:**
This refined review aims to better capture your intended evaluation of the paper.`;
        }

        return review;
    }

    /**
     * 验证输出格式
     * @param {string} output - 模型输出
     * @returns {boolean} 是否有效
     */
    static validateOutput(output) {
        return typeof output === 'string' && output.length > 0;
    }
}
