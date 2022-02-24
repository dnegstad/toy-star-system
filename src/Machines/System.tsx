import { createMachine } from 'xstate';
import { StarType } from './Game';

export type SystemContext = {
    id: string;
    name: string;
    starType: StarType;
};

export type SystemEvent =
| { type: 'PLANET.SELECT', value: string }
| { type: 'PLANET.DESELECT' };

export const systemMachine = createMachine<SystemContext, SystemEvent>({

});