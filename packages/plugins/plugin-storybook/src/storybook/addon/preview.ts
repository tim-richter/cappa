import { withCappaDecorator } from "./decorator";

export const decorators = [withCappaDecorator];

export const parameters = {};

export const afterEach = () => {
  // Set the flag to indicate that the play function has completed
  (window as any).playAfterEach = true;
};
