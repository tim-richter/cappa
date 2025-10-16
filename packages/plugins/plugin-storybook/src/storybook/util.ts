/**
 * Wait for a function to be exposed on the window object
 * @param name - The name of the function to wait for
 * @param timeoutMs - The timeout in milliseconds
 * @returns The function or rejects if the function is not exposed within the timeout
 */
export const waitForExposed = (
  name: string,
  timeoutMs = 5000,
): Promise<(id: string, parameters: any) => void> => {
  return new Promise((resolve, reject) => {
    const start = performance.now();

    const t = setInterval(() => {
      const fn = (window as any)[name];
      if (typeof fn === "function") {
        clearInterval(t);
        resolve(fn);
      } else if (performance.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error(`Timed out waiting for ${name}`));
      }
    }, 16);
  });
};
