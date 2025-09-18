import { createConsola } from "consola";

export const initLogger = (level: number) => {
  const consola = createConsola({
    level,
    formatOptions: {
      colors: true,
      date: false,
    },
  });

  consola.wrapConsole();

  return consola;
};
