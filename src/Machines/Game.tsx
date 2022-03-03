import { useInterpret, useSelector } from '@xstate/react';
import React, { useContext } from 'react';
import { ActorRefFrom, assign, createMachine, InterpreterFrom, spawn } from 'xstate';
import { string, z } from 'zod';
import { db } from '../Data/Database';
import { StarMap, StarMapCanvas } from '../StarMap/StarMap';

import { starMapMachine, StarMapMachine } from './StarMap';

export type GameContext = {
    starMap: {
        width: number;
        height: number;
        ref: ActorRefFrom<StarMapMachine>;
    },
    systems: Record<string, null>;
    planets: Record<string, null>;
}

export type GameEvent =
| { type: 'BACK' }
| { type: 'STAR_MAP.SELECT_SYSTEM', value: string }
| { type: 'SYSTEM_LIST.SHOW' };

const initializeGameState = async () => {
    await Promise.all([db.starSystems.clear(), db.planets.clear()]);
    const starSystems = await db.starSystems.bulkAdd([{
        name: 'Blue man group',
        type: 'blue',
        size: 'supergiant',
        x: 0,
        y: 0,
    }, {
        name: 'White christmas',
        type: 'white',
        size: 'giant',
        x: 150,
        y: 150,
    }, {
        name: 'Mellow yellow',
        type: 'yellow',
        size: 'large',
        x: -200,
        y: -200,
    }, {
        name: 'Tang',
        type: 'orange',
        size: 'medium',
        x: 400,
        y: 0,
    }, {
        name: 'Red dwarf',
        type: 'red',
        size: 'small',
        x: 0,
        y: 400,
    }, {
        name: 'Red menace',
        type: 'red',
        size: 'dwarf',
        x: 0,
        y: -400,
    }, {
        name: 'The sun?',
        type: 'yellow',
        size: 'medium',
        x: -300,
        y: 100,
    }], { allKeys: true });

    const planets = await db.planets.bulkAdd([{
        type: 'barren',
        size: 'small',
        starSystemId: starSystems[0],
        orbit: 0,
    }, {
        type: 'ocean',
        size: 'large',
        starSystemId: starSystems[0],
        orbit: 1,
    }, {
        type: 'terran',
        size: 'large',
        starSystemId: starSystems[0],
        orbit: 2,
    }, {
        type: 'tundra',
        size: 'large',
        starSystemId: starSystems[0],
        orbit: 3,
    }, {
        type: 'gasgiant',
        size: 'gasgiant',
        starSystemId: starSystems[0],
        orbit: 4,
    }, {
        type: 'ocean',
        size: 'huge',
        starSystemId: starSystems[1],
        orbit: 4,
    }, {
        type: 'swamp',
        size: 'tiny',
        starSystemId: starSystems[2],
        orbit: 0,
    }, {
        type: 'tundra',
        size: 'small',
        starSystemId: starSystems[3],
        orbit: 1,
    }], { allKeys: true });

    return {starSystems, planets};
}

/**
 * State machine representing top level game UI contexts. Effectively represents the
 * user navigating the game UI to view the starmap, list of explored systems, list of
 * colonies, etc.
 */
export const gameMachine = createMachine<GameContext, GameEvent>({
    id: 'game',
    context: {
        starMap: {
            width: 0,
            height: 0,
            ref: {} as ActorRefFrom<StarMapMachine>,
        },
        systems: {},
        planets: {},
    },
    initial: 'loading',
    states: {
        // Initial loading state
        loading: {
            invoke: {
                src: initializeGameState,
                onDone: {
                    target: 'initializingGame',
                },
            },
        },
        initializingGame: {
            type: 'parallel',
            states: {
                createStarMap: {
                    initial: 'createRef',
                    states: {
                        createRef: {
                            always: [{
                                target: 'done',
                                actions: assign({
                                    starMap: ({starMap, systems, planets}) => {
                                        return {
                                            ...starMap,
                                            ref: spawn(starMapMachine, 'starMap'),
                                        };
                                    },
                                }),
                            }],
                        },
                        done: {
                            type: 'final',
                        },
                    },
                },
            },
            onDone: {
                target: 'starMap',
            },
        },
        starMap: {},
        systemList: {
            // todo: system list context
        }
    },
    on: {
        'BACK': { target: 'starMap' },
        'STAR_MAP.SELECT_SYSTEM': {
            target: 'starMap',
            actions: ({starMap}, {value}) => {
                return starMap.ref.send({type: 'SYSTEM.SELECT', value});
            },
        },
        'SYSTEM_LIST.SHOW': { target: 'systemList' },
    },
});

export const GameStateContext = React.createContext({ gameService: {} as InterpreterFrom<typeof gameMachine> });

type GameProps = {
    width: number;
    height: number;
}

export const Game: React.FC<GameProps> = ({width, height}) => {
    const gameService = useInterpret(gameMachine, {
        context: {
            starMap: {
                width,
                height,
                ref: {} as ActorRefFrom<StarMapMachine>,
            },
            planets: {},
            systems: {},
        },
    });

    const isStarMap = useSelector(gameService, (state) => {
        return state.matches('starMap');
    });
    const starMapRef = useSelector(gameService, (state) => {
        return state.context.starMap.ref;
    });

    return (
        <>
            {isStarMap && (
                <StarMapCanvas machine={starMapRef} />
            )}
        </>
    );
}
