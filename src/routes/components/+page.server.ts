import { allComponents} from '$lib/db';

export const load = async () => {
	const data = await allComponents();
	return { components: data };
};
