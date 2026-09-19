import type { ScreenshotCategory } from "@cappa/protocol";
import { cn } from "@ui/lib/utils";
import { Inbox } from "lucide-react";
import type { FC, ReactNode } from "react";

interface EmptyCopy {
  title: string;
  description: string;
}

/**
 * What "nothing here" means, per category.
 *
 * An empty category is usually the *good* outcome — no changed screenshots
 * means the baseline holds — so the copy says which of the four kinds of
 * nothing this is rather than leaving the user to guess whether the page
 * loaded, is empty, or broke.
 */
const EMPTY_COPY: Record<ScreenshotCategory, EmptyCopy> = {
  changed: {
    title: "No changed screenshots",
    description: "Everything matches the baseline.",
  },
  new: {
    title: "No new screenshots",
    description: "Every captured screenshot already has an approved baseline.",
  },
  deleted: {
    title: "No deleted screenshots",
    description: "Every baseline still has a screenshot to compare against.",
  },
  passed: {
    title: "No passed screenshots",
    description: "Nothing has been compared against a baseline yet.",
  },
};

const UNCATEGORISED: EmptyCopy = {
  title: "No screenshots",
  description: "Run `cappa capture` to capture some.",
};

/** The copy {@link EmptyState} shows, exported for tests and for reuse. */
export const emptyCopyFor = (category?: ScreenshotCategory): EmptyCopy =>
  category ? EMPTY_COPY[category] : UNCATEGORISED;

export interface EmptyStateProps {
  category?: ScreenshotCategory;
  /** Overrides the category's description, e.g. for a search with no hits. */
  description?: ReactNode;
  className?: string;
}

export const EmptyState: FC<EmptyStateProps> = ({
  category,
  description,
  className,
}) => {
  const copy = emptyCopyFor(category);

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border p-8 text-center",
        className,
      )}
    >
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />

      <div className="space-y-1">
        <p className="font-medium text-foreground">{copy.title}</p>
        <p className="text-sm text-muted-foreground">
          {description ?? copy.description}
        </p>
      </div>
    </div>
  );
};
