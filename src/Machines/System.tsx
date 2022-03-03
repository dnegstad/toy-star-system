import { createMachine } from 'xstate';
import { string } from 'zod';
import { PlanetRecord, StarType } from '../Data/Database';

export type SystemContext = {
    id: string;
    name: string;
    type: StarType;
    planets: Array<PlanetRecord>;
    x: number;
    y: number;
};

export type SystemEvent =
| { type: 'PLANET.SELECT', value: string }
| { type: 'PLANET.DESELECT' };

export const systemMachine = createMachine<SystemContext, SystemEvent>({
    id: 'system',
    context: {} as SystemContext,
    initial: 'default',
    states: {

    }
});