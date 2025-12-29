import type { RenderableSetting } from '$lib/types/settings';

export interface SearchResult {
    setting: RenderableSetting;
    score: number;
}

export function searchSettings(
    query: string,
    settings: RenderableSetting[],
    values?: Record<string, unknown>
): SearchResult[] {
    if (!query || !query.trim()) {
        return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    for (const setting of settings) {
        let score = 0;

        // Cache lowercase conversions to avoid repeated calls
        const key = setting.key.toLowerCase();
        const title = (setting._extra?.title || setting.label).toLowerCase();
        const description = (setting._extra?.description || setting.description).toLowerCase();
        const category = setting.category.toLowerCase();

        // 1. Internal param name (Key) - Highest priority
        if (key === normalizedQuery) {
            score += 100;
        } else if (key.startsWith(normalizedQuery)) {
            score += 80;
        } else if (key.includes(normalizedQuery)) {
            score += 60;
        }

        // 2. The title of the param
        if (title === normalizedQuery) {
            score += 90;
        } else if (title.startsWith(normalizedQuery)) {
            score += 70;
        } else if (title.includes(normalizedQuery)) {
            score += 50;
        }

        // 3. The description of the param
        if (description.includes(normalizedQuery)) {
            score += 30;
        }

        // 4. The value of the param
        const currentValue = values?.[setting.key];
        if (currentValue !== undefined && currentValue !== null) {
            const valueStr = String(currentValue).toLowerCase();
            if (valueStr.includes(normalizedQuery)) {
                score += 20;
            }
        } else if (setting.value?.default_value !== undefined && setting.value?.default_value !== null) {
            const valueStr = String(setting.value.default_value).toLowerCase();
            if (valueStr.includes(normalizedQuery)) {
                score += 20;
            }
        }

        // 5. The category of the param
        if (category.includes(normalizedQuery)) {
            score += 10;
        }

        if (score > 0) {
            results.push({ setting, score });
        }
    }

    return results.sort((a, b) => b.score - a.score);
}
