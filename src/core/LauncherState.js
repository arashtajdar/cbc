// THE 10 MINIGAME REGISTRY
export const minigamesRegistry = [
    {
        id: 'deflecto',
        name: 'Deflecto',
        description: '3D shield-defending hockey arena.',
        status: 'Active',
        arenas: ['Neon Stadium', 'Grid Matrix', 'Solar Plexus']
    },
    {
        id: 'tilefall',
        name: 'TileFall',
        description: 'Grid-dropping survival arena.',
        status: 'Active',
        arenas: ['Volcano Core', 'Deep Abyss', 'Cyber Void']
    },
    {
        id: 'boxbrawl',
        name: 'BoxBrawl',
        description:
            'Grid arena where players lift, carry, and throw TNT/wooden crates at each other.',
        status: 'Active',
        arenas: ['Cargo Dock', 'Warehouse Chaos', 'TNT Factory']
    },
    {
        id: 'slideout',
        name: 'SlideOut',
        description: 'Slippery ice platform where players dash to bump opponents off.',
        status: 'Active/Ready to Play',
        arenas: ['Slippery Summit', 'Glacier Edge', 'Frostbite Tundra']
    },
    {
        id: 'bounceclaim',
        name: 'BounceClaim',
        description: 'Grid-based arena where players bounce on tiles to color them.',
        status: 'Active/Ready to Play',
        arenas: ['Pixel Floor', 'Voxel Verse', 'Color Clash']
    },
    {
        id: 'ricochet',
        name: 'Ricochet',
        description: 'Miniature 3D maze arena with explosive bouncing projectiles.',
        status: 'Active/Ready to Play',
        arenas: ['Concrete Maze', 'Rusty Warrens', 'Iron Labyrinth']
    },
    {
        id: 'kineticring',
        name: 'KineticRing',
        description: 'Circular sumo wrestling arena using rolling/dashing vehicles.',
        status: 'Active/Ready to Play',
        arenas: ['Sky Dojo', 'Floating Tatami', 'Neon Ring']
    },
    {
        id: 'hexcollapse',
        name: 'HexCollapse',
        description: 'Falling hex-grid platform where layers of tiles collapse dynamically.',
        status: 'Active/Ready to Play',
        arenas: ['Crumble Heights', 'Stratosphere Drop', 'Aero Grid']
    },
    {
        id: 'shrinkzone',
        name: 'ShrinkZone',
        description: 'Survival arena with localized hazards and shrinking safe zones.',
        status: 'Active/Ready to Play',
        arenas: ['Biohazard Zone', 'Acid Pit', 'Reactor Core']
    },
    {
        id: 'sweeper',
        name: 'Sweeper',
        description: 'A rotating, tilting beam platform where players must jump/duck.',
        status: 'Active/Ready to Play',
        arenas: ['Centrifuge', 'Rotor Wash', 'Turbine Deck']
    }
];

// GLOBAL ENGINE & INPUT STATES
// STATE MACHINE CONFIGURATION
export const launcherState = {
    currentState: 'SPLASH',
    selectedGame: null,
    selectedArena: null,
    characters: [
        { id: 'blaze', name: 'Blaze', shape: 'blaze', color: 0xff3333, hex: '#ff3333' },
        { id: 'glitch', name: 'Glitch', shape: 'glitch', color: 0x39ff14, hex: '#39ff14' },
        { id: 'wave', name: 'Wave', shape: 'wave', color: 0x00f0ff, hex: '#00f0ff' },
        { id: 'shadow', name: 'Shadow', shape: 'shadow', color: 0xb026ff, hex: '#b026ff' }
    ],
    playerAssignments: {
        p1: 0,
        p2: 1,
        p3: 2,
        p4: 3
    },
    aiDifficulty: 'normal'
};

export function saveLauncherState () {
    if (typeof localStorage !== 'undefined') {
        try {
            const stateToSave = {
                currentState: launcherState.currentState,
                selectedGame: launcherState.selectedGame,
                selectedArena: launcherState.selectedArena,
                playerAssignments: launcherState.playerAssignments,
                aiDifficulty: launcherState.aiDifficulty
            };
            localStorage.setItem('launcherState', JSON.stringify(stateToSave));
        } catch (e) {
            console.warn('Could not save state', e);
        }
    }
};
