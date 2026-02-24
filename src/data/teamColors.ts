import { assetUrl } from '../lib/teamAssets';

// Team colors for glow effects - Official AFL team colors
export interface TeamColors {
  primary: string;
  secondary: string;
  glow: string;
  glowStrong: string;
  gradient: string;
  logo: string;
}

export const TEAM_COLORS: Record<string, TeamColors> = {
  'Adelaide Crows': {
    primary: '#002B5C',
    secondary: '#E31937',
    glow: 'rgba(227, 25, 55, 0.6)',
    glowStrong: 'rgba(227, 25, 55, 0.9)',
    gradient: 'linear-gradient(135deg, #002B5C 0%, #E31937 100%)',
    logo: assetUrl('Adelaide Crows (Light).png'),
  },
  'Brisbane Lions': {
    primary: '#A30046',
    secondary: '#FDBA31',
    glow: 'rgba(253, 186, 49, 0.6)',
    glowStrong: 'rgba(253, 186, 49, 0.9)',
    gradient: 'linear-gradient(135deg, #A30046 0%, #FDBA31 100%)',
    logo: assetUrl('Brisbane Lions (Light).png'),
  },
  'Carlton': {
    primary: '#031A33',
    secondary: '#FFFFFF',
    glow: 'rgba(3, 26, 51, 0.7)',
    glowStrong: 'rgba(3, 26, 51, 1)',
    gradient: 'linear-gradient(135deg, #031A33 0%, #0A3D7A 100%)',
    logo: assetUrl('Carlton (Light).png'),
  },
  'Collingwood': {
    primary: '#000000',
    secondary: '#FFFFFF',
    glow: 'rgba(255, 255, 255, 0.4)',
    glowStrong: 'rgba(255, 255, 255, 0.6)',
    gradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    logo: assetUrl('Collingwood (Light).png'),
  },
  'Essendon': {
    primary: '#CC2031',
    secondary: '#000000',
    glow: 'rgba(204, 32, 49, 0.6)',
    glowStrong: 'rgba(204, 32, 49, 0.9)',
    gradient: 'linear-gradient(135deg, #CC2031 0%, #000000 100%)',
    logo: assetUrl('Essendon.png'),
  },
  'Fremantle': {
    primary: '#2A0F56',
    secondary: '#FFFFFF',
    glow: 'rgba(42, 15, 86, 0.7)',
    glowStrong: 'rgba(42, 15, 86, 1)',
    gradient: 'linear-gradient(135deg, #2A0F56 0%, #5A3A9A 100%)',
    logo: assetUrl('Fremantle (Light).png'),
  },
  'Geelong Cats': {
    primary: '#002B5C',
    secondary: '#FFFFFF',
    glow: 'rgba(0, 43, 92, 0.7)',
    glowStrong: 'rgba(0, 43, 92, 1)',
    gradient: 'linear-gradient(135deg, #002B5C 0%, #1A5AA3 100%)',
    logo: assetUrl('Geelong Cats (Light).png'),
  },
  'Gold Coast Suns': {
    primary: '#E31937',
    secondary: '#FDBA31',
    glow: 'rgba(253, 186, 49, 0.6)',
    glowStrong: 'rgba(253, 186, 49, 0.9)',
    gradient: 'linear-gradient(135deg, #E31937 0%, #FDBA31 100%)',
    logo: assetUrl('Gold Coast Suns (Light).png'),
  },
  'GWS Giants': {
    primary: '#F15A22',
    secondary: '#C8102E',
    glow: 'rgba(241, 90, 34, 0.6)',
    glowStrong: 'rgba(241, 90, 34, 0.9)',
    gradient: 'linear-gradient(135deg, #F15A22 0%, #C8102E 100%)',
    logo: assetUrl('GWS Giants (Light).png'),
  },
  'Hawthorn': {
    primary: '#4D2004',
    secondary: '#FDBA31',
    glow: 'rgba(253, 186, 49, 0.6)',
    glowStrong: 'rgba(253, 186, 49, 0.9)',
    gradient: 'linear-gradient(135deg, #4D2004 0%, #FDBA31 100%)',
    logo: assetUrl('Hawthorn (Light).png'),
  },
  'Melbourne': {
    primary: '#002B5C',
    secondary: '#E31937',
    glow: 'rgba(0, 43, 92, 0.6)',
    glowStrong: 'rgba(0, 43, 92, 0.9)',
    gradient: 'linear-gradient(135deg, #002B5C 0%, #E31937 100%)',
    logo: assetUrl('Melbourne.png'),
  },
  'North Melbourne': {
    primary: '#0039A6',
    secondary: '#FFFFFF',
    glow: 'rgba(0, 57, 166, 0.7)',
    glowStrong: 'rgba(0, 57, 166, 1)',
    gradient: 'linear-gradient(135deg, #0039A6 0%, #4A7BD9 100%)',
    logo: assetUrl('North Melbourne.png'),
  },
  'Port Adelaide': {
    primary: '#000000',
    secondary: '#FFFFFF',
    glow: 'rgba(255, 255, 255, 0.4)',
    glowStrong: 'rgba(255, 255, 255, 0.6)',
    gradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    logo: assetUrl('Port Adelaide.png'),
  },
  'Richmond': {
    primary: '#000000',
    secondary: '#FDBA31',
    glow: 'rgba(253, 186, 49, 0.6)',
    glowStrong: 'rgba(253, 186, 49, 0.9)',
    gradient: 'linear-gradient(135deg, #000000 0%, #FDBA31 100%)',
    logo: assetUrl('Richmond (Light).png'),
  },
  'St Kilda': {
    primary: '#E31937',
    secondary: '#000000',
    glow: 'rgba(227, 25, 55, 0.6)',
    glowStrong: 'rgba(227, 25, 55, 0.9)',
    gradient: 'linear-gradient(135deg, #E31937 0%, #000000 100%)',
    logo: assetUrl('St Kilda.png'),
  },
  'Sydney Swans': {
    primary: '#E31937',
    secondary: '#FFFFFF',
    glow: 'rgba(227, 25, 55, 0.6)',
    glowStrong: 'rgba(227, 25, 55, 0.9)',
    gradient: 'linear-gradient(135deg, #E31937 0%, #8B0A1A 100%)',
    logo: assetUrl('Sydney Swans (Light).png'),
  },
  'West Coast Eagles': {
    primary: '#002B5C',
    secondary: '#FDBA31',
    glow: 'rgba(0, 43, 92, 0.6)',
    glowStrong: 'rgba(0, 43, 92, 0.9)',
    gradient: 'linear-gradient(135deg, #002B5C 0%, #FDBA31 100%)',
    logo: assetUrl('West Coast Eagles (Light).png'),
  },
  'Western Bulldogs': {
    primary: '#002B5C',
    secondary: '#E31937',
    glow: 'rgba(0, 43, 92, 0.6)',
    glowStrong: 'rgba(0, 43, 92, 0.9)',
    gradient: 'linear-gradient(135deg, #002B5C 0%, #E31937 100%)',
    logo: assetUrl('Western Bulldogs.png'),
  },
};

// Short names mapping
export const TEAM_SHORT_NAMES: Record<string, string> = {
  'Adelaide Crows': 'Adelaide',
  'Brisbane Lions': 'Brisbane',
  'Carlton': 'Carlton',
  'Collingwood': 'Collingwood',
  'Essendon': 'Essendon',
  'Fremantle': 'Fremantle',
  'Geelong Cats': 'Geelong',
  'Gold Coast Suns': 'Gold Coast',
  'GWS Giants': 'GWS',
  'Hawthorn': 'Hawthorn',
  'Melbourne': 'Melbourne',
  'North Melbourne': 'North',
  'Port Adelaide': 'Port Adelaide',
  'Richmond': 'Richmond',
  'St Kilda': 'St Kilda',
  'Sydney Swans': 'Sydney',
  'West Coast Eagles': 'West Coast',
  'Western Bulldogs': 'Bulldogs',
};

// Reverse mapping from short to full name
export const SHORT_TO_FULL: Record<string, string> = {
  'Adelaide': 'Adelaide Crows',
  'Brisbane': 'Brisbane Lions',
  'Carlton': 'Carlton',
  'Collingwood': 'Collingwood',
  'Essendon': 'Essendon',
  'Fremantle': 'Fremantle',
  'Geelong': 'Geelong Cats',
  'Gold Coast': 'Gold Coast Suns',
  'GWS': 'GWS Giants',
  'Hawthorn': 'Hawthorn',
  'Melbourne': 'Melbourne',
  'North': 'North Melbourne',
  'Port Adelaide': 'Port Adelaide',
  'Richmond': 'Richmond',
  'St Kilda': 'St Kilda',
  'Sydney': 'Sydney Swans',
  'West Coast': 'West Coast Eagles',
  'Bulldogs': 'Western Bulldogs',
};

// Full team list for the 12-team competition
export const TEAMS_12 = [
  'Adelaide Crows',
  'Brisbane Lions',
  'Carlton',
  'Collingwood',
  'Essendon',
  'Fremantle',
  'Geelong Cats',
  'Gold Coast Suns',
  'GWS Giants',
  'Hawthorn',
  'Melbourne',
  'North Melbourne',
] as const;

export type TeamName = typeof TEAMS_12[number];
