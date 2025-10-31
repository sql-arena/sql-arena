
export type MisEstimate = { magnitude: number, count: number };

/* Basic types to pass around */
export type Component = {slug: string, component: string, description: string };
export type Tag = {slug: string, tag: string };
export type Engine = {slug: string, engine: string };
export type Theorem = {slug: string, theorem: string };


export const MAX_RANK: number = 3;