import { fetchEngineProofDataByTag } from '$lib/db';

export const load = async ({params}) => {
	const proofData = await fetchEngineProofDataByTag(params.engine, params.tag)
	return {engine: params.engine, tag: params.tag, proofData: proofData}
}