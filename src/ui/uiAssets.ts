const BASE = `${import.meta.env.BASE_URL}assets`;

/** URL of an individual UI sprite. Retina (2×) images are used and downscaled by CSS. */
export function uiImage(path: `${'menu' | 'controls' | 'hud'}/${string}`): string {
  return `${BASE}/png/retina/ui/${path}.png`;
}

export const SCENE_BACKGROUND_URL = `${BASE}/ui_scene_background.png`;
export const LOGO_URL = `${BASE}/logo_jungle_gaming.svg`;
export const MENU_SHIP_URL = `${BASE}/png/retina/ships/ship_3.png`;

export type IconName =
  | 'close'
  | 'fire_front'
  | 'fire_left'
  | 'fire_right'
  | 'forward'
  | 'home'
  | 'minus'
  | 'pause'
  | 'play'
  | 'plus'
  | 'restart'
  | 'settings'
  | 'turn_left'
  | 'turn_right';

export function iconUrl(name: IconName): string {
  return uiImage(`controls/icon_${name}`);
}
