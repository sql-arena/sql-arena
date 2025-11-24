export function formatRows(n: number) {
	if (n === undefined || n === null || isNaN(n)) {
		return '-';
	}
	return n.toLocaleString();
}