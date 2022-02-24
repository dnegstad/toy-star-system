import { createMachine, assign, ActorRefFrom, sendUpdate } from 'xstate';

export type StarMapContext = {
    width: number;
    height: number;
    selectedSystem?: string;
    systemDetailWindowWidth: number;
    systemDetailWindowHeight: number;
};

export type StarMapEvent =
| { type: 'SYSTEM.SELECT', value: string }
| { type: 'SYSTEM.DESELECT' };

export const starMapMachine = createMachine<StarMapContext, StarMapEvent>({
    id: 'starMap',
    context: {
        width: 0,
        height: 0,
        systemDetailWindowWidth: 600,
        systemDetailWindowHeight: 600,
    },
    initial: 'default',
    states: {
        default: {},
        systemSelected: {
        },
    },
    on: {
        'SYSTEM.DESELECT': {
            target: 'default',
            actions: [
                assign({
                    selectedSystem: (_) => {
                        console.log('Action SYSTEM.DESELECT');
                        return undefined;
                    },
                }),
                sendUpdate(),
            ],
        },
        'SYSTEM.SELECT': {
            target: 'systemSelected',
            actions: [
                assign({
                    selectedSystem: (_, {value}) => {
                        console.log('Action SYSTEM.SELECT:', value);
                        return value;
                    },
                }),
                sendUpdate(),
            ],
        },
    },
});
export type StarMapMachine = typeof starMapMachine;
