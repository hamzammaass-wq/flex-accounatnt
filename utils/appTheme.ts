export const applyAppTheme = (darkModeEnabled: boolean) => {
  if (typeof document === 'undefined') return;

  const themeName = darkModeEnabled ? 'dark' : 'light';
  const themeColor = darkModeEnabled ? '#08111f' : '#f8fafc';

  document.documentElement.setAttribute('data-app-theme', themeName);
  document.documentElement.style.colorScheme = themeName;
  document.body.setAttribute('data-app-theme', themeName);
  document.body.style.backgroundColor = themeColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
};
