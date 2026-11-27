import { zhTW } from './zh-TW';

export type Locale = 'en' | 'zh-TW';
export const locale: Locale = 'zh-TW';

export function t(path: string): string {
	if (locale !== 'zh-TW') return path;
	let value: unknown = zhTW;
	for (const key of path.split('.')) value = (value as Record<string, unknown>)?.[key];
	return typeof value === 'string' ? value : path;
}
