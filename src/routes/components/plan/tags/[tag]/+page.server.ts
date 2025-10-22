import { fetchTagProofData, fetchTagProofDataSummary, resolveComponent, resolveTag } from '$lib/db';

export const load = async ({params}) => {
	const proofSummaryData = await fetchTagProofDataSummary("plan", params.tag)
	const proofData = await fetchTagProofData("plan", params.tag)
	const component = await resolveComponent("plan");
	const tag = await resolveTag(params.tag);
	return {
		proofSummaryData: proofSummaryData,
		proofData: proofData,
		tag: tag,
		component: component
	};
}
