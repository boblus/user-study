/**
 * CSV解析工具
 * 用于解析participants.csv文件
 */

class CSVParser {
    /**
     * 解析CSV文本为对象数组
     * @param {string} csvText - CSV文本内容
     * @returns {Array<Object>} 解析后的对象数组
     */
    static parse(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            return [];
        }

        // 解析表头
        const headers = lines[0].split(',').map(h => h.trim());

        // 解析数据行
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length !== headers.length) {
                console.warn(`行 ${i + 1} 列数不匹配，跳过`);
                continue;
            }

            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = values[index].trim();
            });
            data.push(obj);
        }

        return data;
    }

    /**
     * 解析CSV行，处理引号内的逗号
     * @param {string} line - CSV行文本
     * @returns {Array<string>} 解析后的值数组
     */
    static parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 转义的双引号
                    current += '"';
                    i++; // 跳过下一个引号
                } else {
                    // 切换引号状态
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // 字段分隔符
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        // 添加最后一个字段
        values.push(current);
        return values;
    }

    /**
     * 从URL加载CSV文件
     * @param {string} url - CSV文件URL
     * @returns {Promise<Array<Object>>}
     */
    static async loadFromURL(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }
            const text = await response.text();
            return this.parse(text);
        } catch (error) {
            console.error('加载CSV文件失败:', error);
            throw error;
        }
    }
}

