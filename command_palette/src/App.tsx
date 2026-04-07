import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  readText as readClipboardText,
  writeText as writeClipboardText,
} from "@tauri-apps/plugin-clipboard-manager";
import "./App.css";

type ViewKey = "groups" | "clipboard-transforms";

type CommandOutcome = {
  message: string;
  hide: boolean;
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
    }
  | {
      kind: "disabled";
      id: string;
      title: string;
      hint: string;
      accent: string;
    };

const VIEW_TITLES: Record<ViewKey, string> = {
  groups: "Command Palette",
  "clipboard-transforms": "Clipboard Transforms",
};

const VIEW_DESCRIPTIONS: Record<ViewKey, string> = {
  groups: "Choose a command family.",
  "clipboard-transforms": "Clipboard-only transforms inspired by the AutoHotkey shortcuts.",
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
    };
  }

  await writeClipboardText(transformedText);

  return {
    message: successMessage,
    hide: true,
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
  const [view, setView] = useState<ViewKey>("groups");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Ready. Ctrl + Alt + Space opens the palette.");

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

  const visibleCommands =
    filteredCommands.length > 0
      ? filteredCommands
      : [
          {
            kind: "disabled" as const,
            id: "empty",
            title: "No matching commands",
            hint: "Try a different search term.",
            accent: view === "groups" ? "Groups" : "Transforms",
          },
        ];

  const activeCommand =
    visibleCommands[Math.min(selectedIndex, visibleCommands.length - 1)] ?? visibleCommands[0];

  async function dismissPalette(message?: string) {
    if (message) {
      setStatus(message);
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
    setStatus(message);
  }

  function openClipboardTransforms() {
    setView("clipboard-transforms");
    setQuery("");
    setSelectedIndex(0);
    setStatus("Clipboard Transforms opened.");
  }

  async function runCommand(command: CommandItem) {
    if (command.kind === "disabled") {
      setStatus(view === "groups" ? "No command groups matched that search." : "No transforms matched that search.");
      return;
    }

    if (command.kind === "group") {
      openClipboardTransforms();
      return;
    }

    try {
      const outcome = await command.run();

      if (outcome.hide) {
        await dismissPalette(outcome.message);
        return;
      }

      setStatus(outcome.message);
    } catch (error) {
      setStatus(formatErrorMessage(error));
    }
  }

  useEffect(() => {
    const focusSearch = () => {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    };

    const handleWindowFocus = () => {
      focusSearch();
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [view]);

  return (
    <main className="app-shell">
      <section className="palette" aria-label="Command palette">
        <header className="palette__header">
          <div className="palette__heading">
            {view !== "groups" ? (
              <button type="button" className="palette__back" onClick={() => returnToGroups()}>
                Back to groups
              </button>
            ) : null}

            <div>
              <p className="palette__eyebrow">{view === "groups" ? "Tray first" : "Clipboard transforms"}</p>
              <h1 className="palette__title">{VIEW_TITLES[view]}</h1>
            </div>

            <p className="palette__lede">{VIEW_DESCRIPTIONS[view]}</p>
          </div>

          <div className="palette__badge">
            {view === "groups" ? `${ROOT_COMMANDS.length} group` : `${CLIPBOARD_TRANSFORM_COMMANDS.length} actions`}
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
            placeholder={view === "groups" ? "Search command groups..." : "Search clipboard transforms..."}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) => Math.min(current + 1, visibleCommands.length - 1));
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => Math.max(current - 1, 0));
              }

              if (event.key === "Enter") {
                event.preventDefault();
                void runCommand(activeCommand);
              }

              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                void dismissPalette("Returned to tray.");
              }
            }}
          />
        </label>

        <ul
          className="results"
          aria-label={view === "groups" ? "Available command groups" : "Available clipboard transforms"}
        >
          {visibleCommands.map((command, index) => {
            const isActive = index === selectedIndex;
            const buttonClassName =
              command.kind === "disabled"
                ? "result result--disabled"
                : isActive
                  ? "result result--active"
                  : "result";

            return (
              <li key={command.id}>
                <button
                  type="button"
                  className={buttonClassName}
                  data-active={isActive && command.kind !== "disabled"}
                  disabled={command.kind === "disabled"}
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

        <footer className="palette__footer">
          <p className="status">{status}</p>

          <div className="shortcuts" aria-label="Keyboard shortcuts">
            <span className="kbd">Ctrl + Alt + Space</span>
            {view !== "groups" ? <span className="kbd">Back</span> : null}
            <span className="kbd">Esc</span>
            <span className="kbd">Enter</span>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default App;