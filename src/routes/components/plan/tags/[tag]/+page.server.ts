import {
	fetchTagProofData
} from '$lib/db';

export const load = async ({params}) => {
	const proofData = await fetchTagProofData("plan", params.tag)
	return {
		proofData: proofData,
		tag: params.tag
	};
}
