import { fetchTagProofData, fetchTagProofDataSummary } from '$lib/db';

export const load = async ({params}) => {
	const proofSummaryData = await fetchTagProofDataSummary("plan", params.tag)
	const proofData = await fetchTagProofData("plan", params.tag)
	return {
		proofSummaryData: proofSummaryData,
		proofData: proofData,
		tag: params.tag
	};
}
