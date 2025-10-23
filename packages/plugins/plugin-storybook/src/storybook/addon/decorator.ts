import { makeDecorator } from "storybook/preview-api";
import { waitForExposed } from "../util";

export const withCappaDecorator = makeDecorator({
  name: "withCappa",
  parameterName: "cappa",
  skipIfNoParametersOrOptions: false,
  wrapper: (getStory, context, { parameters }) => {
    (window as any).__cappa_screenshot = true;

    // Set indicator if this story has a play function
    if (context.playFunction != null) {
      (window as any).__cappa_has_play_function = true;
    }

    queueMicrotask(async () => {
      try {
        const cappaParameters = await waitForExposed("__cappa_parameters");
        cappaParameters(context.id, parameters ?? {});
      } catch (error) {
        console.error("Cappa decorator error:", error);
      }
    });

    return getStory(context);
  },
});
