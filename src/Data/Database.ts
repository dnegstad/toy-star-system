import Dexie, { Table } from 'dexie';
import 'dexie-observable';
import { z } from 'zod';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

const HasIdentity = z.object({
    uuid: z.string().uuid().optional(),
});
type HasIdentity = z.infer<typeof HasIdentity>;

const HasPosition = z.object({
    x: z.number(),
    y: z.number(),
});
type HasPosition = z.infer<typeof HasPosition>;

export const StarType = z.union([
    z.literal('blue'),
    z.literal('white'),
    z.literal('yellow'),
    z.literal('orange'),
    z.literal('red'),
]);
export type StarType = Expand<z.infer<typeof StarType>>;

export const StarSystemRecord = z.object({
    name: z.string(),
    starType: StarType,
}).and(HasIdentity).and(HasPosition);
export type StarSystemRecord = Expand<z.infer<typeof StarSystemRecord>>;

export const PlanetType = z.union([
    z.literal('barren'),
    z.literal('desert'),
    z.literal('ocean'),
    z.literal('swamp'),
    z.literal('terran'),
    z.literal('toxic'),
    z.literal('tundra'),
    z.literal('volcanic'),
    z.literal('gasgiant'),
]);
export type PlanetType = Expand<z.infer<typeof PlanetType>>;

export const PlanetSize = z.union([
    z.literal('tiny'),
    z.literal('small'),
    z.literal('medium'),
    z.literal('large'),
    z.literal('huge'),
    z.literal('asteroids'),
    z.literal('gasgiant'),
]);
export type PlanetSize = Expand<z.infer<typeof PlanetSize>>;

export const PlanetRecord = z.object({
    type: PlanetType,
    size: PlanetSize,
    starSystemId: z.string(),
    orbit: z.number().gte(0),
}).and(HasIdentity);
export type PlanetRecord = Expand<z.infer<typeof PlanetRecord>>;

export class GameDatabase extends Dexie {
    starSystems!: Table<StarSystemRecord, string>;
    planets!: Table<PlanetRecord, string>;

    constructor() {
        super('gameDatabase');

        this.version(1).stores({
            starSystems: '$$uuid, name, starType, x, y',
            planets: '$$uuid, planetType, starSystemId, orbit, [starSystemId+orbit]',
        });
    }
}

export const db = new GameDatabase();
