export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  placeholder: string;
  chipBackground: string;
  chipBorder: string;
}

export const lightColors: ThemeColors = {
  background: '#ffffff',
  surface: '#f5f5f5',
  surfaceAlt: '#eeeeee',
  text: '#111111',
  textMuted: '#666666',
  border: '#dddddd',
  primary: '#1c7c54',
  primaryText: '#ffffff',
  danger: '#c0392b',
  placeholder: '#999999',
  chipBackground: '#ffffff',
  chipBorder: '#cccccc',
};

export const darkColors: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#262626',
  text: '#f2f2f2',
  textMuted: '#a6a6a6',
  border: '#3a3a3a',
  primary: '#2fae7b',
  primaryText: '#ffffff',
  danger: '#e0685c',
  placeholder: '#777777',
  chipBackground: '#1e1e1e',
  chipBorder: '#444444',
};
