/**
 * Checks if the current window is a cappa window
 */
export const isCappa = () => {
  return navigator.userAgent.includes("CappaStorybook");
};
