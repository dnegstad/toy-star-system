import { useInterpret, useSelector } from '@xstate/react';
import React, { useContext } from 'react';
import { ActorRefFrom, assign, createMachine, InterpreterFrom, spawn } from 'xstate';
import { string, z } from 'zod';
import { db } from '../Data/Database';
import { StarMap } from '../StarMap/StarMap';

import { starMapMachine, StarMapMachine } from './StarMap';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

const HasIdentity = z.object({
    id: z.string().uuid(),
    kind: z.string(),
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
    kind: z.literal('system'),
    name: z.string(),
    starType: StarType,
    planets: z.array(z.string()),
}).and(HasIdentity).and(HasPosition);
export type StarSystemRecord = Expand<z.infer<typeof StarSystemRecord>>;

export const PlanetType = z.union([
    z.literal('barren'),
    z.literal('volcanic'),
    z.literal('desert'),
    z.literal('terran'),
    z.literal('abundant'),
    z.literal('ocean'),
    z.literal('tundra'),
    z.literal('gasgiant'),
    z.literal('asteroids'),
]);
export type PlanetType = Expand<z.infer<typeof PlanetType>>;

export const PlanetRecord = z.object({
    kind: z.literal('planet'),
    planetType: PlanetType,
    system: z.string(),
    orbit: z.number().gte(0),
}).and(HasIdentity);
export type PlanetRecord = Expand<z.infer<typeof PlanetRecord>>;

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
        starType: 'blue',
        x: 0,
        y: 0,
    }, {
        name: 'White christmas',
        starType: 'white',
        x: 150,
        y: 150,
    }, {
        name: 'Mellow yellow',
        starType: 'yellow',
        x: -200,
        y: -200,
    }, {
        name: 'Tang',
        starType: 'orange',
        x: 400,
        y: 0,
    }, {
        name: 'Red dwarf',
        starType: 'red',
        x: 0,
        y: 400,
    }, {
        name: 'Red menace',
        starType: 'red',
        x: 0,
        y: -400,
    }, {
        name: 'The sun?',
        starType: 'yellow',
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
                                            ref: spawn(starMapMachine.withContext({
                                                width: starMap.width,
                                                height: starMap.height,
                                                systemDetailWindowWidth: 600,
                                                systemDetailWindowHeight: 600,
                                            }), 'starMap'),
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
                <StarMap machine={starMapRef} />
            )}
        </>
    );
}
