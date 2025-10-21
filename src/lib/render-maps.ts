/* Maps operations from the fact_proof table into whatever names we use in the interface */
export const operation_map = new Map<string, string>([
	['Join', 'join'],
	['Aggregate', 'aggregate'],
	['Hash', 'hash'],
	['Scan', 'scan'],
	['Sort', 'sort'],
]);


export const ESTIMATE_CATEGORIES = ['join', 'aggregate', 'sort', 'hash', 'scan'];
