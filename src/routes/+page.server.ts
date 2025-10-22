import { allComponents} from '$lib/db';

export const load = async () => {
	const all = await allComponents();
	return { components: all };
};
