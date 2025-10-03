import { allComponents} from '$lib/db';
export const prerender = true;

export const load = async () => {
	const data = await allComponents();
	return { components: data };
};
