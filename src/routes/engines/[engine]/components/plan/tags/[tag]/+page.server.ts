import {
	fetchEngineProofDataByTag,
	fetchTagProofDataSummary,
	resolveComponent,
	resolveEngine,
	resolveTag
} from '$lib/db';

export const load = async ({params}) => {
	const proofData = await fetchEngineProofDataByTag(params.engine, params.tag)
	const engine = await resolveEngine(params.engine);
	const tag = await resolveTag(params.tag);
	const component = await resolveComponent("plan");
	const proofSummaryData = await fetchTagProofDataSummary("plan", tag.slug)
	return {engine: engine, tag: tag, proofData: proofData, component: component, proofSummaryData: proofSummaryData}
}