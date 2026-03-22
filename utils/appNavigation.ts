import type { TabView } from '../App';
import type { SettingsMode } from '../components/DefinitionsMenu';

export type AppNavigationTarget = {
  tab: TabView;
  definitionsMode?: SettingsMode;
};

export const APP_NAVIGATION_EVENT_NAME = 'smart-account:app-navigation';

export const openAppNavigation = (target: AppNavigationTarget): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AppNavigationTarget>(APP_NAVIGATION_EVENT_NAME, { detail: target }));
};
