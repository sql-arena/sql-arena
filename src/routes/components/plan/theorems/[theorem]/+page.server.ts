import { fetchTheoremProofData, loadMarkdown } from '$lib/db';
export const prerender = true;

export const load = async ({params}) => {
	const theorem = params.theorem;
	const proofData = await fetchTheoremProofData(theorem);
	const commentary = await loadMarkdown(theorem);
	return {
		theorem: theorem,
		proofData: proofData,
		commentary: commentary,
	};
}
