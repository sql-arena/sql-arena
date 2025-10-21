import {
	fetchTheoremPlanData,
	fetchTheoremProofData,
	fetchTheoremTags,
	loadMarkdown
} from '$lib/db';
export const prerender = true;

export async function entries() {
	const { fetchTheoremPerComponent } = await import('$lib/db');
	const rows = await fetchTheoremPerComponent("plan");
	return rows.map(row => ({ theorem: String(row.theorem).toLowerCase() }));
}

export const load = async ({params}) => {
	const theorem = params.theorem;
	const proofData = await fetchTheoremProofData(theorem);
	const commentary = await loadMarkdown(theorem);
	const planData = await fetchTheoremPlanData(theorem);
	const tags = await fetchTheoremTags("plan", theorem);
	return {
		theorem: theorem,
		proofData: proofData,
		planData: planData,
		commentary: commentary,
		tags : tags
	};
}
