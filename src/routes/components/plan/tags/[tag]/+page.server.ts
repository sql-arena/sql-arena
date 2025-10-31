import { fetchTagProofData, fetchTagProofDataSummary, resolveComponent, resolveTag } from '$lib/db';

export const load = async ({params}) => {
	const component = await resolveComponent("plan");
	const tag = await resolveTag(params.tag);
	const proofSummaryData = await fetchTagProofDataSummary(component.slug, tag.slug)
	const proofData = await fetchTagProofData(component.slug, tag.slug)
	return {
		proofSummaryData: proofSummaryData,
		proofData: proofData,
		tag: tag,
		component: component
	};
}
