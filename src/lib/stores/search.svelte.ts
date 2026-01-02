export const searchState = $state({
	query: '',

	setQuery(q: string) {
		this.query = q;
	},

	clear() {
		this.query = '';
	}
});
