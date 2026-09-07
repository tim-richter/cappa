import { ProtocolMismatchError, UnauthorizedError } from "@cappa/client";
import type { FC, ReactNode } from "react";

/**
 * The two ways the server can refuse to talk to this UI at all.
 *
 * Both used to render as an empty app: the sidebar total stayed blank, every
 * list said "Error fetching screenshots" after ten seconds of retries, and the
 * capture page cheerfully offered a Start button over "0 task(s) available".
 * Neither is a screenshot problem, so neither belongs in a per-page error
 * state — the whole UI is unusable and should say why.
 */
export const isServerUnavailable = (error: unknown): boolean =>
  error instanceof UnauthorizedError || error instanceof ProtocolMismatchError;

const Screen: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div
    role="alert"
    className="flex h-screen w-full items-center justify-center bg-background p-6"
  >
    <div className="max-w-lg text-center">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  </div>
);

export const ServerUnavailable: FC<{ error: unknown }> = ({ error }) => {
  if (error instanceof ProtocolMismatchError) {
    return (
      <Screen title="Version mismatch">
        <p>
          This review UI speaks protocol version {error.expected}, and the
          server speaks {error.actual}.
        </p>
        <p>Upgrade whichever of the two is older, then reload.</p>
      </Screen>
    );
  }

  return (
    <Screen title="Access token required">
      <p>
        This server was started on a non-loopback host, so every request needs
        the access token it printed on startup.
      </p>
      <p>
        Open the full <code>http://…?token=…</code> URL from the server's
        output. The token is kept for this tab only, so a new tab needs that URL
        again.
      </p>
    </Screen>
  );
};
