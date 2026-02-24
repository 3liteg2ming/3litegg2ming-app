// src/data/afl26LocalRounds.ts
// Local fallback fixture set (11 rounds, 12 teams, 6 games per round)
// Used when Supabase has no rows yet (or during offline/dev).

import type { AflRound } from './afl26Supabase';

export const afl26LocalRounds: AflRound[] = [
  {
    'round': 1,
    'matches': [
      {
        'id': 'r1m1',
        'venue': 'MCG • Melbourne',
        'status': 'FINAL',
        'home': 'adelaide',
        'away': 'brisbane',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'BRI_COACH',
        'homeScore': {
          'goals': 12,
          'behinds': 10,
          'total': 82
        },
        'awayScore': {
          'goals': 10,
          'behinds': 8,
          'total': 68
        }
      },
      {
        'id': 'r1m2',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'essendon',
        'away': 'goldcoast',
        'homePsn': 'ESS_COACH',
        'awayPsn': 'GOL_COACH'
      },
      {
        'id': 'r1m3',
        'venue': 'Optus Stadium • Perth',
        'status': 'SCHEDULED',
        'home': 'melbourne',
        'away': 'collingwood',
        'homePsn': 'MEL_COACH',
        'awayPsn': 'COL_COACH'
      },
      {
        'id': 'r1m4',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'hawthorn',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'HAW_COACH'
      },
      {
        'id': 'r1m5',
        'venue': 'Optus Stadium • Perth',
        'status': 'SCHEDULED',
        'home': 'geelong',
        'away': 'gws',
        'homePsn': 'GEE_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r1m6',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'fremantle',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'FRE_COACH'
      }
    ]
  },
  {
    'round': 2,
    'matches': [
      {
        'id': 'r2m7',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'geelong',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'GEE_COACH'
      },
      {
        'id': 'r2m8',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'adelaide',
        'away': 'gws',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r2m9',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'fremantle',
        'away': 'goldcoast',
        'homePsn': 'FRE_COACH',
        'awayPsn': 'GOL_COACH'
      },
      {
        'id': 'r2m10',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'essendon',
        'away': 'northmelbourne',
        'homePsn': 'ESS_COACH',
        'awayPsn': 'NOR_COACH'
      },
      {
        'id': 'r2m11',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'hawthorn',
        'away': 'carlton',
        'homePsn': 'HAW_COACH',
        'awayPsn': 'CAR_COACH'
      },
      {
        'id': 'r2m12',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'collingwood',
        'away': 'melbourne',
        'homePsn': 'COL_COACH',
        'awayPsn': 'MEL_COACH'
      }
    ]
  },
  {
    'round': 3,
    'matches': [
      {
        'id': 'r3m13',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'adelaide',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'ADE_COACH'
      },
      {
        'id': 'r3m14',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'essendon',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'ESS_COACH'
      },
      {
        'id': 'r3m15',
        'venue': 'Optus Stadium • Perth',
        'status': 'SCHEDULED',
        'home': 'collingwood',
        'away': 'goldcoast',
        'homePsn': 'COL_COACH',
        'awayPsn': 'GOL_COACH'
      },
      {
        'id': 'r3m16',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'geelong',
        'away': 'northmelbourne',
        'homePsn': 'GEE_COACH',
        'awayPsn': 'NOR_COACH'
      },
      {
        'id': 'r3m17',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'fremantle',
        'away': 'gws',
        'homePsn': 'FRE_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r3m18',
        'venue': 'Marvel Stadium • Melbourne',
        'status': 'SCHEDULED',
        'home': 'melbourne',
        'away': 'hawthorn',
        'homePsn': 'MEL_COACH',
        'awayPsn': 'HAW_COACH'
      }
    ]
  },
  {
    'round': 4,
    'matches': [
      {
        'id': 'r4m19',
        'venue': 'SCG • Sydney',
        'status': 'SCHEDULED',
        'home': 'essendon',
        'away': 'geelong',
        'homePsn': 'ESS_COACH',
        'awayPsn': 'GEE_COACH'
      },
      {
        'id': 'r4m20',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'fremantle',
        'away': 'gws',
        'homePsn': 'FRE_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r4m21',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'hawthorn',
        'away': 'collingwood',
        'homePsn': 'HAW_COACH',
        'awayPsn': 'COL_COACH'
      },
      {
        'id': 'r4m22',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'goldcoast',
        'away': 'northmelbourne',
        'homePsn': 'GOL_COACH',
        'awayPsn': 'NOR_COACH'
      },
      {
        'id': 'r4m23',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'melbourne',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'MEL_COACH'
      },
      {
        'id': 'r4m24',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'adelaide',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'ADE_COACH'
      }
    ]
  },
  {
    'round': 5,
    'matches': [
      {
        'id': 'r5m25',
        'venue': 'SCG • Sydney',
        'status': 'SCHEDULED',
        'home': 'essendon',
        'away': 'collingwood',
        'homePsn': 'ESS_COACH',
        'awayPsn': 'COL_COACH'
      },
      {
        'id': 'r5m26',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'geelong',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'GEE_COACH'
      },
      {
        'id': 'r5m27',
        'venue': 'SCG • Sydney',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'goldcoast',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'GOL_COACH'
      },
      {
        'id': 'r5m28',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'gws',
        'away': 'melbourne',
        'homePsn': 'GWS_COACH',
        'awayPsn': 'MEL_COACH'
      },
      {
        'id': 'r5m29',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'fremantle',
        'away': 'adelaide',
        'homePsn': 'FRE_COACH',
        'awayPsn': 'ADE_COACH'
      },
      {
        'id': 'r5m30',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'hawthorn',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'HAW_COACH'
      }
    ]
  },
  {
    'round': 6,
    'matches': [
      {
        'id': 'r6m31',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'goldcoast',
        'away': 'geelong',
        'homePsn': 'GOL_COACH',
        'awayPsn': 'GEE_COACH'
      },
      {
        'id': 'r6m32',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'melbourne',
        'away': 'gws',
        'homePsn': 'MEL_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r6m33',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'collingwood',
        'away': 'fremantle',
        'homePsn': 'COL_COACH',
        'awayPsn': 'FRE_COACH'
      },
      {
        'id': 'r6m34',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'essendon',
        'away': 'brisbane',
        'homePsn': 'ESS_COACH',
        'awayPsn': 'BRI_COACH'
      },
      {
        'id': 'r6m35',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'hawthorn',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'HAW_COACH'
      },
      {
        'id': 'r6m36',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'adelaide',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'ADE_COACH'
      }
    ]
  },
  {
    'round': 7,
    'matches': [
      {
        'id': 'r7m37',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'collingwood',
        'away': 'goldcoast',
        'homePsn': 'COL_COACH',
        'awayPsn': 'GOL_COACH'
      },
      {
        'id': 'r7m38',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'gws',
        'away': 'fremantle',
        'homePsn': 'GWS_COACH',
        'awayPsn': 'FRE_COACH'
      },
      {
        'id': 'r7m39',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'geelong',
        'away': 'hawthorn',
        'homePsn': 'GEE_COACH',
        'awayPsn': 'HAW_COACH'
      },
      {
        'id': 'r7m40',
        'venue': 'SCG • Sydney',
        'status': 'SCHEDULED',
        'home': 'adelaide',
        'away': 'melbourne',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'MEL_COACH'
      },
      {
        'id': 'r7m41',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'essendon',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'ESS_COACH'
      },
      {
        'id': 'r7m42',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'carlton',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'CAR_COACH'
      }
    ]
  },
  {
    'round': 8,
    'matches': [
      {
        'id': 'r8m43',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'adelaide',
        'away': 'geelong',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'GEE_COACH'
      },
      {
        'id': 'r8m44',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'essendon',
        'away': 'gws',
        'homePsn': 'ESS_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r8m45',
        'venue': 'Marvel Stadium • Melbourne',
        'status': 'SCHEDULED',
        'home': 'fremantle',
        'away': 'melbourne',
        'homePsn': 'FRE_COACH',
        'awayPsn': 'MEL_COACH'
      },
      {
        'id': 'r8m46',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'hawthorn',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'HAW_COACH'
      },
      {
        'id': 'r8m47',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'goldcoast',
        'away': 'collingwood',
        'homePsn': 'GOL_COACH',
        'awayPsn': 'COL_COACH'
      },
      {
        'id': 'r8m48',
        'venue': 'Marvel Stadium • Melbourne',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'brisbane',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'BRI_COACH'
      }
    ]
  },
  {
    'round': 9,
    'matches': [
      {
        'id': 'r9m49',
        'venue': 'Optus Stadium • Perth',
        'status': 'SCHEDULED',
        'home': 'hawthorn',
        'away': 'gws',
        'homePsn': 'HAW_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r9m50',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'adelaide',
        'away': 'essendon',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'ESS_COACH'
      },
      {
        'id': 'r9m51',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'goldcoast',
        'away': 'northmelbourne',
        'homePsn': 'GOL_COACH',
        'awayPsn': 'NOR_COACH'
      },
      {
        'id': 'r9m52',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'melbourne',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'MEL_COACH'
      },
      {
        'id': 'r9m53',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'fremantle',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'FRE_COACH'
      },
      {
        'id': 'r9m54',
        'venue': 'Optus Stadium • Perth',
        'status': 'SCHEDULED',
        'home': 'collingwood',
        'away': 'geelong',
        'homePsn': 'COL_COACH',
        'awayPsn': 'GEE_COACH'
      }
    ]
  },
  {
    'round': 10,
    'matches': [
      {
        'id': 'r10m55',
        'venue': 'MCG • Melbourne',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'goldcoast',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'GOL_COACH'
      },
      {
        'id': 'r10m56',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'geelong',
        'away': 'melbourne',
        'homePsn': 'GEE_COACH',
        'awayPsn': 'MEL_COACH'
      },
      {
        'id': 'r10m57',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'fremantle',
        'away': 'essendon',
        'homePsn': 'FRE_COACH',
        'awayPsn': 'ESS_COACH'
      },
      {
        'id': 'r10m58',
        'venue': 'Adelaide Oval • Adelaide',
        'status': 'SCHEDULED',
        'home': 'adelaide',
        'away': 'hawthorn',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'HAW_COACH'
      },
      {
        'id': 'r10m59',
        'venue': 'GMHBA Stadium • Geelong',
        'status': 'SCHEDULED',
        'home': 'gws',
        'away': 'carlton',
        'homePsn': 'GWS_COACH',
        'awayPsn': 'CAR_COACH'
      },
      {
        'id': 'r10m60',
        'venue': 'Optus Stadium • Perth',
        'status': 'SCHEDULED',
        'home': 'brisbane',
        'away': 'collingwood',
        'homePsn': 'BRI_COACH',
        'awayPsn': 'COL_COACH'
      }
    ]
  },
  {
    'round': 11,
    'matches': [
      {
        'id': 'r11m61',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'goldcoast',
        'away': 'essendon',
        'homePsn': 'GOL_COACH',
        'awayPsn': 'ESS_COACH'
      },
      {
        'id': 'r11m62',
        'venue': 'SCG • Sydney',
        'status': 'SCHEDULED',
        'home': 'northmelbourne',
        'away': 'brisbane',
        'homePsn': 'NOR_COACH',
        'awayPsn': 'BRI_COACH'
      },
      {
        'id': 'r11m63',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'hawthorn',
        'away': 'geelong',
        'homePsn': 'HAW_COACH',
        'awayPsn': 'GEE_COACH'
      },
      {
        'id': 'r11m64',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'melbourne',
        'away': 'gws',
        'homePsn': 'MEL_COACH',
        'awayPsn': 'GWS_COACH'
      },
      {
        'id': 'r11m65',
        'venue': 'Gabba • Brisbane',
        'status': 'SCHEDULED',
        'home': 'adelaide',
        'away': 'collingwood',
        'homePsn': 'ADE_COACH',
        'awayPsn': 'COL_COACH'
      },
      {
        'id': 'r11m66',
        'venue': 'UTAS Stadium • Launceston',
        'status': 'SCHEDULED',
        'home': 'carlton',
        'away': 'fremantle',
        'homePsn': 'CAR_COACH',
        'awayPsn': 'FRE_COACH'
      }
    ]
  },
];
