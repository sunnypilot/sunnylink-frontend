export interface GitHubLabel {
	name: string;
}

export interface GitHubIssue {
	id: number;
	number: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	created_at: string;
	closed_at?: string | null;
	labels: GitHubLabel[];
	html_url: string;
	comments_url: string;
}

export interface GitHubComment {
	id: number;
	body: string;
	created_at: string;
	html_url: string;
}

export const mockIssues: GitHubIssue[] = [
	{
		id: 1,
		number: 101,
		title: 'Active Error (Non-Dismissible)',
		body: '[Public Notification]: Critical System Failure. (Body Message)',
		state: 'open',
		created_at: new Date().toISOString(),
		labels: [{ name: 'sunnylink' }, { name: 'status' }],
		html_url: '',
		comments_url: 'mock_comments_1'
	},
	{
		id: 2,
		number: 102,
		title: 'Active Warning (Dismissible)',
		body: '[Public Notification]: Intermittent Degradation. (Body Message)',
		state: 'open',
		created_at: new Date(Date.now() - 10000).toISOString(),
		labels: [{ name: 'sunnylink' }, { name: 'maintenance' }],
		html_url: '',
		comments_url: 'mock_comments_2'
	},
	{
		id: 3,
		number: 103,
		title: 'Active Warning with Comment Update',
		body: '[Public Notification]: Initial Warning Message.',
		state: 'open',
		created_at: new Date(Date.now() - 20000).toISOString(),
		labels: [{ name: 'sunnylink' }, { name: 'maintenance' }],
		html_url: '',
		comments_url: 'mock_comments_update'
	},
	{
		id: 4,
		number: 104,
		title: 'Recent Closed Info (Visible < 24h)',
		body: '[Public Notification]: Scheduled maintenance complete.',
		state: 'closed',
		created_at: new Date(Date.now() - 100000).toISOString(),
		closed_at: new Date(Date.now() - 3600000).toISOString(), // Closed 1 hour ago
		labels: [{ name: 'sunnylink' }, { name: 'info' }],
		html_url: '',
		comments_url: 'mock_comments_empty'
	},
	{
		id: 5,
		number: 105,
		title: 'Old Closed Info (Hidden > 24h)',
		body: '[Public Notification]: Old maintenance.',
		state: 'closed',
		created_at: new Date(Date.now() - 200000000).toISOString(),
		closed_at: new Date(Date.now() - 90000000).toISOString(), // Closed > 24h ago
		labels: [{ name: 'sunnylink' }, { name: 'info' }],
		html_url: '',
		comments_url: 'mock_comments_empty'
	},
	{
		id: 6,
		number: 106,
		title: 'Issue Missing Tag (Hidden)',
		body: 'Internal discussion only. No public tag.',
		state: 'open',
		created_at: new Date().toISOString(),
		labels: [{ name: 'sunnylink' }, { name: 'status' }],
		html_url: '',
		comments_url: 'mock_comments_empty'
	}
];

// Mock function to simulate comment fetch
export const mockFetchComments = async (url: string): Promise<GitHubComment[]> => {
	if (url === 'mock_comments_update') {
		return [
			{
				id: 999,
				body: '[Public Notification]: This message comes from a COMMENT and overrides the body!',
				created_at: new Date().toISOString(), // Newer than body
				html_url: ''
			}
		];
	}
	return [];
};
