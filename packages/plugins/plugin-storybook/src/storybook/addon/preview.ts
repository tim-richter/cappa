import { withCappaDecorator } from "./decorator";

export const decorators = [withCappaDecorator];

export const parameters = {};

export const afterEach = () => {
  (window as any).playAfterEach = true;
};
