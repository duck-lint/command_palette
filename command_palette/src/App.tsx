import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./App.css";

type CommandItem = {
  id: string;
  title: string;
  hint: string;
  accent: string;
  disabled?: boolean;
};

const appWindow = getCurrentWebviewWindow();

const COMMANDS: CommandItem[] = [
  {
    id: "open-settings",
    title: "Open settings",
    hint: "Adjust shell preferences and shortcut behavior.",
    accent: "System",
  },
  {
    id: "search-workspace",
    title: "Search workspace",
    hint: "Find files, symbols, and commands.",
    accent: "Files",
  },
  {
    id: "create-note",
    title: "Create note",
    hint: "Start a scratchpad entry and keep moving.",
    accent: "Notes",
  },
  {
    id: "toggle-theme",
    title: "Toggle theme",
    hint: "Flip the palette between dim and bright states.",
    accent: "UI",
  },
  {
    id: "quit-app",
    title: "Quit app",
    hint: "Exit the tray process completely.",
    accent: "Power",
  },
];

function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Ready. Ctrl + Alt + Space opens the palette.");

  const filteredCommands = COMMANDS.filter((command) => {
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
            id: "empty",
            title: "No matching commands",
            hint: "Try a different search term.",
            accent: "Empty",
            disabled: true,
          },
        ];

  const activeCommand =
    visibleCommands[Math.min(selectedIndex, visibleCommands.length - 1)] ??
    visibleCommands[0];

  async function dismissPalette(message?: string) {
    if (message) {
      setStatus(message);
    }

    setQuery("");
    setSelectedIndex(0);
    await appWindow.hide();
  }

  async function runCommand(command: CommandItem) {
    if (command.disabled) {
      await dismissPalette("No command matched that search.");
      return;
    }

    setStatus(`Executed ${command.title}.`);
    await dismissPalette(`Executed ${command.title}.`);
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

  return (
    <main className="app-shell">
      <section className="palette" aria-label="Command palette">
        <header className="palette__header">
          <div>
            <p className="palette__eyebrow">Tray first</p>
            <h1 className="palette__title">Command Palette</h1>
          </div>

          <div className="palette__badge">Ready</div>
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
            placeholder="Search commands or type a note..."
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) =>
                  Math.min(current + 1, visibleCommands.length - 1),
                );
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

        <ul className="results" aria-label="Available commands">
          {visibleCommands.map((command, index) => {
            const isActive = index === selectedIndex;

            return (
              <li key={command.id}>
                <button
                  type="button"
                  className={isActive ? "result result--active" : "result"}
                  data-active={isActive}
                  disabled={command.disabled}
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
            <span className="kbd">Esc</span>
            <span className="kbd">Enter</span>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default App;
