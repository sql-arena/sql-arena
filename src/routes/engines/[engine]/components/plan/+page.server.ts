import { fetchEngineProofDataSummary, resolveComponent, resolveEngine } from '$lib/db';

export const load = async ({params}) => {
	const engine = await resolveEngine(params.engine);
	const proofData = await fetchEngineProofDataSummary("plan", engine.engine )
	const component = await resolveComponent("plan");
	return {
		engine: engine,
		component: component,
		proofSummaryData: proofData
	}
}