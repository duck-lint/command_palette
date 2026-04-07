import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  readText as readClipboardText,
  writeText as writeClipboardText,
} from "@tauri-apps/plugin-clipboard-manager";
import "./App.css";

type ViewKey = "groups" | "clipboard-transforms";
type StatusTone = "info" | "success" | "warning" | "error" | "busy";

type StatusState = {
  message: string;
  tone: StatusTone;
};

type CommandOutcome = {
  message: string;
  hide: boolean;
  tone: StatusTone;
};

type CommandItem =
  | {
      kind: "group";
      id: string;
      title: string;
      hint: string;
      accent: string;
      nextView: Exclude<ViewKey, "groups">;
    }
  | {
      kind: "action";
      id: string;
      title: string;
      hint: string;
      accent: string;
      run: () => Promise<CommandOutcome>;
    };

const DEFAULT_STATUS: StatusState = {
  message: "Ready. Ctrl + Alt + Space opens the palette.",
  tone: "info",
};

const VIEW_TITLES: Record<ViewKey, string> = {
  groups: "Command Palette",
  "clipboard-transforms": "Clipboard Transforms",
};

const SEARCH_PLACEHOLDERS: Record<ViewKey, string> = {
  groups: "Search command groups...",
  "clipboard-transforms": "Search clipboard transforms...",
};

const appWindow = getCurrentWebviewWindow();

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Clipboard action failed.";
}

function titleCase(text: string) {
  return text.toLowerCase().replace(/(^|\s+)([a-z])/g, (_match, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
}

function capitalizeEachWord(text: string) {
  return text.toLowerCase().replace(/(^|[^a-z0-9]+)([a-z])/g, (_match, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
}

function lowerSnakeCase(text: string) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function looksLikeWindowsPath(text: string) {
  return /^[a-z]:\\/i.test(text) || text.startsWith("\\\\");
}

function looksLikeSlashPath(text: string) {
  return /^[a-z]:\//i.test(text) || text.startsWith("//");
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

async function transformClipboardText(
  transform: (text: string) => string | null,
  successMessage: string,
  skipMessage = "Clipboard text did not match that transform.",
): Promise<CommandOutcome> {
  const clipboardText = await readClipboardText();
  const transformedText = transform(clipboardText);

  if (transformedText === null) {
    return {
      message: skipMessage,
      hide: false,
      tone: "warning",
    };
  }

  await writeClipboardText(transformedText);

  return {
    message: successMessage,
    hide: true,
    tone: "success",
  };
}

const ROOT_COMMANDS: CommandItem[] = [
  {
    kind: "group",
    id: "clipboard-transforms",
    title: "Clipboard Transforms",
    hint: "Open the clipboard-only transform family.",
    accent: "Open",
    nextView: "clipboard-transforms",
  },
];

const CLIPBOARD_TRANSFORM_COMMANDS: CommandItem[] = [
  {
    kind: "action",
    id: "uppercase",
    title: "Uppercase",
    hint: "Convert the clipboard text to uppercase.",
    accent: "Text",
    run: async () =>
      transformClipboardText(
        (text) => text.toUpperCase(),
        "Copied uppercase clipboard text.",
      ),
  },
  {
    kind: "action",
    id: "lowercase",
    title: "Lowercase",
    hint: "Convert the clipboard text to lowercase.",
    accent: "Text",
    run: async () =>
      transformClipboardText(
        (text) => text.toLowerCase(),
        "Copied lowercase clipboard text.",
      ),
  },
  {
    kind: "action",
    id: "title-case",
    title: "Title Case",
    hint: "Capitalize words after spaces.",
    accent: "Text",
    run: async () =>
      transformClipboardText(
        (text) => titleCase(text),
        "Copied title case clipboard text.",
      ),
  },
  {
    kind: "action",
    id: "capitalize-each-word",
    title: "Capitalize Each Word",
    hint: "Capitalize words after any non-alphanumeric separator.",
    accent: "Text",
    run: async () =>
      transformClipboardText(
        (text) => capitalizeEachWord(text),
        "Copied capitalized clipboard text.",
      ),
  },
  {
    kind: "action",
    id: "backslashes-to-forward-slashes",
    title: "Backslashes to Forward Slashes",
    hint: "Normalize Windows paths to slash separators.",
    accent: "Path",
    run: async () =>
      transformClipboardText(
        (text) => {
          if (!looksLikeWindowsPath(text)) {
            return null;
          }

          return text.replace(/\\/g, "/");
        },
        "Converted clipboard text to forward slashes.",
        "Clipboard text does not look like a Windows path.",
      ),
  },
  {
    kind: "action",
    id: "forward-slashes-to-backslashes",
    title: "Forward Slashes to Backslashes",
    hint: "Convert slash-delimited paths back to Windows separators.",
    accent: "Path",
    run: async () =>
      transformClipboardText(
        (text) => {
          if (!looksLikeSlashPath(text)) {
            return null;
          }

          return text.replace(/\//g, "\\");
        },
        "Converted clipboard text to backslashes.",
        "Clipboard text does not look like a slash-delimited path.",
      ),
  },
  {
    kind: "action",
    id: "lower-snake-case",
    title: "lower_snake_case",
    hint: "Convert clipboard text to lower snake case.",
    accent: "Normalize",
    run: async () =>
      transformClipboardText(
        (text) => lowerSnakeCase(text),
        "Copied lower snake case clipboard text.",
      ),
  },
];

function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const resultRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [view, setView] = useState<ViewKey>("groups");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<StatusState>(DEFAULT_STATUS);
  const [isRunning, setIsRunning] = useState(false);
  const [hasOverflowAbove, setHasOverflowAbove] = useState(false);
  const [hasOverflowBelow, setHasOverflowBelow] = useState(false);

  const commands = view === "groups" ? ROOT_COMMANDS : CLIPBOARD_TRANSFORM_COMMANDS;

  const filteredCommands = commands.filter((command) => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return true;
    }

    return (
      command.title.toLowerCase().includes(needle) ||
      command.hint.toLowerCase().includes(needle) ||
      command.accent.toLowerCase().includes(needle)
    );
  });

  const activeCommand =
    filteredCommands[Math.min(selectedIndex, Math.max(filteredCommands.length - 1, 0))];
  const activeOptionId = activeCommand ? `palette-option-${activeCommand.id}` : undefined;
  const resultCountLabel =
    view === "groups"
      ? pluralize(filteredCommands.length, "group", "groups")
      : pluralize(filteredCommands.length, "action", "actions");

  function focusSearch() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function updateOverflowIndicators() {
    const viewport = resultsViewportRef.current;

    if (!viewport || filteredCommands.length === 0) {
      setHasOverflowAbove(false);
      setHasOverflowBelow(false);
      return;
    }

    const epsilon = 1;
    setHasOverflowAbove(viewport.scrollTop > epsilon);
    setHasOverflowBelow(viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - epsilon);
  }

  async function dismissPalette(message?: string, tone: StatusTone = "info") {
    if (message) {
      setStatus({
        message,
        tone,
      });
    }

    setQuery("");
    setView("groups");
    setSelectedIndex(0);
    await appWindow.hide();
  }

  function returnToGroups(message = "Returned to command groups.") {
    setView("groups");
    setQuery("");
    setSelectedIndex(0);
    setStatus({
      message,
      tone: "info",
    });
  }

  function openClipboardTransforms() {
    setView("clipboard-transforms");
    setQuery("");
    setSelectedIndex(0);
    setStatus({
      message: "Clipboard Transforms opened.",
      tone: "info",
    });
  }

  async function runCommand(command: CommandItem | undefined) {
    if (!command || isRunning) {
      return;
    }

    if (command.kind === "group") {
      if (command.nextView === "clipboard-transforms") {
        openClipboardTransforms();
      }
      return;
    }

    setIsRunning(true);
    setStatus({
      message: `Running ${command.title}...`,
      tone: "busy",
    });

    try {
      const outcome = await command.run();

      if (outcome.hide) {
        await dismissPalette(outcome.message, outcome.tone);
        return;
      }

      setStatus({
        message: outcome.message,
        tone: outcome.tone,
      });
    } catch (error) {
      setStatus({
        message: formatErrorMessage(error),
        tone: "error",
      });
    } finally {
      setIsRunning(false);
    }
  }

  useEffect(() => {
    const handleWindowFocus = () => {
      focusSearch();
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRunning) {
        event.preventDefault();
        void dismissPalette("Returned to tray.");
      }
    };

    focusSearch();
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isRunning]);

  useEffect(() => {
    setSelectedIndex(0);
    focusSearch();
  }, [view]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(filteredCommands.length - 1, 0)));
    window.requestAnimationFrame(updateOverflowIndicators);
  }, [filteredCommands.length, query, view]);

  useEffect(() => {
    if (!activeCommand) {
      return;
    }

    window.requestAnimationFrame(() => {
      resultRefs.current[activeCommand.id]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      updateOverflowIndicators();
    });
  }, [activeCommand?.id]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredCommands.length > 0) {
        setSelectedIndex((current) => Math.min(current + 1, filteredCommands.length - 1));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredCommands.length > 0) {
        setSelectedIndex((current) => Math.max(current - 1, 0));
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSelectedIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (filteredCommands.length > 0) {
        setSelectedIndex(filteredCommands.length - 1);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void runCommand(activeCommand);
      return;
    }

    if (
      (event.key === "Backspace" && query.trim().length === 0 && view !== "groups") ||
      (event.altKey && event.key === "ArrowLeft" && view !== "groups")
    ) {
      event.preventDefault();
      returnToGroups();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (view !== "groups" && backButtonRef.current) {
        backButtonRef.current.focus();
      } else {
        focusSearch();
      }
      return;
    }

    if (event.key === "Escape" && !isRunning) {
      event.preventDefault();
      event.stopPropagation();
      void dismissPalette("Returned to tray.");
    }
  }

  function handleBackKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      focusSearch();
      return;
    }

    if (event.key === "Escape" && !isRunning) {
      event.preventDefault();
      void dismissPalette("Returned to tray.");
    }
  }

  return (
    <main className="app-shell">
      <section className="palette" aria-label="Command palette" aria-busy={isRunning}>
        <header className="palette__header">
          <div className="palette__heading">
            {view !== "groups" ? (
              <button
                ref={backButtonRef}
                type="button"
                className="palette__back"
                onClick={() => returnToGroups()}
                onKeyDown={handleBackKeyDown}
                disabled={isRunning}
              >
                Back
              </button>
            ) : null}

            <h1 id="palette-title" className="palette__title">
              {VIEW_TITLES[view]}
            </h1>
          </div>

          <div className={`palette__badge palette__badge--${isRunning ? "busy" : "ready"}`}>
            {isRunning ? "Working" : resultCountLabel}
          </div>
        </header>

        <label className="search" htmlFor="palette-search">
          <span className="search__prompt">&gt;</span>
          <input
            ref={inputRef}
            id="palette-search"
            className="search__input"
            value={query}
            autoComplete="off"
            spellCheck={false}
            placeholder={SEARCH_PLACEHOLDERS[view]}
            aria-controls="palette-results"
            aria-activedescendant={activeOptionId}
            disabled={isRunning}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </label>

        {filteredCommands.length > 0 ? (
          <div
            className={`results-shell${hasOverflowAbove ? " results-shell--top" : ""}${hasOverflowBelow ? " results-shell--bottom" : ""}`}
          >
            <div ref={resultsViewportRef} className="results-scroll" onScroll={updateOverflowIndicators}>
              <ul id="palette-results" className="results" role="listbox" aria-labelledby="palette-title">
                {filteredCommands.map((command, index) => {
                  const isActive = index === selectedIndex;
                  const optionId = `palette-option-${command.id}`;

                  return (
                    <li key={command.id}>
                      <button
                        ref={(element) => {
                          resultRefs.current[command.id] = element;
                        }}
                        id={optionId}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        tabIndex={-1}
                        className={isActive ? "result result--active" : "result"}
                        data-active={isActive}
                        disabled={isRunning}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                          void runCommand(command);
                        }}
                      >
                        <div className="result__copy">
                          <span className="result__title">{command.title}</span>
                          <span className="result__hint">{command.hint}</span>
                        </div>
                        <span className="result__accent">{command.accent}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          <section className="empty-state" aria-live="polite">
            <p className="empty-state__title">No matching commands</p>
            <p className="empty-state__copy">Try a different search term or clear the search to see everything in this view.</p>
          </section>
        )}

        <footer className="palette__footer">
          <p className={`status status--${status.tone}`} aria-live="polite">
            <span>{status.message}</span>
          </p>
        </footer>
      </section>
    </main>
  );
}

export default App;