import {
	fetchTheoremPlanData,
	fetchTheoremProofData,
	fetchTheoremTags,
	loadMarkdown,
	resolveComponent,
	resolveTheorem
} from '$lib/db';
import type { Theorem } from '$lib/arena-types';
export const prerender = true;

export async function entries() {
	const { fetchTheoremPerComponent } = await import('$lib/db');
	const rows = await fetchTheoremPerComponent("plan");
	return rows.map(row => ({ theorem: (row.theorem as Theorem).slug }));
}

export const load = async ({params}) => {
	const theorem = await resolveTheorem(params.theorem);
	const proofData = await fetchTheoremProofData(theorem.slug);
	const commentary = await loadMarkdown(theorem.slug);
	const planData = await fetchTheoremPlanData(theorem.slug);
	const tags = await fetchTheoremTags("plan", theorem.slug);
	const component = await resolveComponent("plan");
	return {
		theorem: theorem,
		proofData: proofData,
		planData: planData,
		commentary: commentary,
		tags : tags,
		component: component
	};
}
