import { makeDecorator } from "storybook/preview-api";
import { waitForExposed } from "../util";

export const withCappaDecorator = makeDecorator({
  name: "withCappa",
  parameterName: "cappa",
  skipIfNoParametersOrOptions: false,
  wrapper: (getStory, context, { parameters }) => {
    (window as any).__cappa_screenshot = true;

    const hasPlayFunction = context.playFunction != null;

    queueMicrotask(async () => {
      try {
        const cappaParameters = await waitForExposed("__cappa_parameters");

        cappaParameters(parameters ?? {});
      } catch (error) {
        console.error(error);
      }
    });

    return getStory(context);
  },
});
