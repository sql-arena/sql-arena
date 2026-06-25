
export type MisEstimate = { magnitude: string, count: number };

/* Basic types to pass around */
export type Component = {slug: string, component: string, description: string };
export type Tag = {slug: string, tag: string };
export type Engine = {slug: string, engine: string, version: string, storage_variant: string };
export type Theorem = {slug: string, theorem: string, sql?: string };

/* Max rank that gets a star */
export const MAX_RANK: number = 3;