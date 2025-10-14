import { fetchTierList } from '$lib/db';
export const prerender = true;

export const load = async () => {
	// Example: Load tier list data from a SQL file
	const tierListData = await fetchTierList('plan-quality');

	return {
		tierListData
	};
}