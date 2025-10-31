import { allBlogs} from '$lib/db';

export const load = async () => {
	const blogs = await allBlogs()
	return { blogs  };
};
