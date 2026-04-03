import { setupWorker } from "msw/browser";
import { handlers } from "../mocks/screenshots";

export const server = setupWorker(...handlers);
