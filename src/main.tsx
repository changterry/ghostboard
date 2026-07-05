import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tool = "select" | "text" | "draw" | "erase" | "pan" | "shape";
type ShapeKind = "line" | "arrow" | "ellipse" | "rect" | "triangle" | "curve";
type ThemeMode = "dark" | "light";
type InputGuideMode = "mouse" | "touchpad";
type SidebarAction = Tool | "clear" | "settings" | "find" | "library";
type InboxUrgency = "low" | "medium" | "high";
type InboxStatus = "open" | "done" | "dismissed";
type SaveStatus = "saved" | "saving" | "offline" | "error";
type InboxErrorCode = "config_missing" | "error" | "";

type Point = {
  x: number;
  y: number;
  pressure?: number;
  t?: number;
};

type Viewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type Settings = {
  themeMode: ThemeMode;
  smartSnapEnabled: boolean;
  eraserMode: "stroke";
  chalkTexture: boolean;
  defaultFontSize: number;
  snapDelayMs: number;
  angleSnapEnabled: boolean;
  angleSnapIncrementDegrees: number;
  angleSnapThresholdDegrees: number;
  rotationSnapEnabled: boolean;
  rotationSnapIncrementDegrees: number;
};

type RotationOrigin = {
  x: number;
  y: number;
  mode: "center" | "start" | "custom";
};

type BaseObject = {
  id: string;
  groupId?: string;
  label?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  color: string;
  rotation?: number;
  origin?: RotationOrigin;
  opacity: number;
  createdAt: number;
  updatedAt?: number;
  rawStartPoint?: Point;
  rawEndPoint?: Point;
  rawPoints?: Point[];
  sourceStrokeId?: string;
  sourceStartPoint?: Point;
  sourceEndPoint?: Point;
};

type TextObject = BaseObject & {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  fontSize: number;
  lineHeight?: number;
};

type StrokeObject = BaseObject & {
  type: "stroke";
  points: Point[];
  size: number;
  bbox: Rect;
};

type ShapeObject = BaseObject & {
  type: "shape";
  shapeType: ShapeKind;
  geometry: ShapeGeometry;
  size: number;
  bbox: Rect;
};

type BoardObject = TextObject | StrokeObject | ShapeObject;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ShapeGeometry =
  | { start: Point; end: Point }
  | { center: Point; rx: number; ry: number }
  | { points: Point[] };

type BoardState = {
  objects: BoardObject[];
  selectedIds: string[];
  currentTool: Tool;
  viewport: Viewport;
  settings: Settings;
};

type GreyboardBoard = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  objects: BoardObject[];
  viewport: Viewport;
  settings: Settings;
  inputGuideMode?: InputGuideMode;
};

type GreyboardLibrary = {
  activeBoardId: string;
  boards: Record<string, GreyboardBoard>;
};

type Interaction =
  | { type: "none" }
  | { type: "pending-canvas"; pointerId: number; startScreen: Point; startWorld: Point; startedAt: number; forceAngleSnap: boolean }
  | { type: "select-box"; pointerId: number; start: Point; current: Point }
  | { type: "pan"; pointerId: number; last: Point }
  | { type: "draw"; pointerId: number; points: Point[]; forceAngleSnap: boolean }
  | { type: "erase"; pointerId: number; erasedIds: Set<string>; before: BoardObject[]; cursor: Point; deleteText: boolean }
  | { type: "move"; pointerId: number; ids: string[]; start: Point; objectStarts: BoardObject[]; before: BoardObject[] }
  | { type: "resize"; pointerId: number; id: string; handle: string; start: Point; objectStart: BoardObject; before: BoardObject[] }
  | { type: "rotate"; pointerId: number; id: string; origin: Point; initialPointerAngle: number; objectStart: BoardObject; before: BoardObject[] };

type EditorState = {
  id: string;
  startObjects: BoardObject[];
  ignoreNextCanvasDown: boolean;
  isNew: boolean;
};

type PendingSnap = {
  timer: number;
  strokeId: string;
};

type TouchGesture = {
  pointerIds: [number, number];
  initialCenter: Point;
  initialDistance: number;
  initialScale: number;
  initialWorldCenter: Point;
};

type SearchResult = {
  objectId: string;
  objectType: "text" | "stroke" | "shape";
  label: string;
  snippet?: string;
  bounds: Rect;
  clusterId?: string;
};

type SmartFindState = {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  activeIndex: number;
};

type InboxTodo = {
  id: string;
  type: "reply" | "follow_up" | "send" | "deadline_change" | "calendar_change" | "recruiter" | "lab" | "professor" | "personal";
  bucket?: string;
  confidence?: number;
  reasonCodes?: string[];
  title: string;
  contactName?: string;
  contactEmail?: string;
  subject?: string;
  emailThreadId?: string;
  emailMessageId?: string;
  gmailUrl?: string;
  dueDate?: string;
  urgency: InboxUrgency;
  reason: string;
  suggestedAction: string;
  suggestedDraft?: string;
  source: "scheduled_inbox" | "gmail";
  accountId?: string;
  accountLabel?: string;
  accountEmail?: string;
  accountIcon?: string;
  accountColor?: string;
  status: InboxStatus;
  createdAt: string;
  updatedAt: string;
};

type InboxAccount = {
  id: string;
  label: string;
  email: string;
  icon?: string;
  color?: string;
};

type InboxState = {
  todos: InboxTodo[];
  accounts: InboxAccount[];
  loading: boolean;
  error: string;
  errorCode: InboxErrorCode;
  lastUpdated?: string;
};

type InboxStatusState = {
  done: Record<string, string>;
  dismissed: Record<string, string>;
};

type InboxEmailPreview = {
  id: string;
  threadId?: string;
  accountId: string;
  from?: string;
  date?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  bodyTruncated: boolean;
  gmailUrl?: string;
};

type InboxPreviewState = {
  byTodoId: Record<string, InboxEmailPreview>;
  openTodoId: string | null;
  loadingTodoId: string | null;
  errorByTodoId: Record<string, string>;
};

type ToastState = {
  message: string;
  actionLabel?: string;
  action?: () => void;
};

type InboxPanelState = {
  isOpen: boolean;
  width: number;
};

const STORAGE_KEY = "ghostboard.state.v1";
const GREYBOARD_LIBRARY_STORAGE_KEY = "greyboard.library.v1";
const INBOX_STATUS_STORAGE_KEY = "greyboard.inboxTodos.status.v1";
const INBOX_PANEL_STORAGE_KEY = "greyboard.inboxPanel.v1";
const LOCAL_CLIPBOARD_KEY = "greyboard.clipboard.v1";
const CLIPBOARD_PREFIX = "greyboard/objects:";
const CLIPBOARD_HTML_PREFIX = "greyboard-data:";
const EMPTY_INTERACTION: Interaction = { type: "none" };
const DEFAULT_INK = "defaultInk";
const MIN_SCALE = 0.18;
const MAX_SCALE = 5;
const HIT_TOLERANCE = 12;
const CLICK_MAX_DURATION_MS = 250;
const DRAG_THRESHOLD_PX = 5;
const TEXT_BOX_MIN_WIDTH = 96;
const TEXT_BOX_MIN_HEIGHT = 56;
const DEFAULT_TEXT_LINE_HEIGHT = 1.16;
const TEXT_FONT_FAMILY = "\"Segoe Print\", \"Comic Sans MS\", \"Bradley Hand ITC\", cursive";
const SMART_FIND_EMPTY: SmartFindState = { isOpen: false, query: "", results: [], activeIndex: 0 };
const SCHEDULE_HIGHLIGHT = "#d8c900";
const INBOX_PANEL_DEFAULT_WIDTH = 400;
const INBOX_PANEL_MIN_WIDTH = 300;
const INBOX_PANEL_MAX_WIDTH = 560;
const INBOX_PANEL_DESKTOP_MIN_WIDTH = 760;
const USE_MOCK_INBOX = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_USE_MOCK_INBOX) === "true";
const THEME = {
  dark: {
    background: "#000000",
    ink: "#f5f5f5",
    selection: "rgba(255,255,255,0.35)",
    handle: "rgba(255,255,255,0.65)",
    sidebarBg: "rgba(20,20,20,0.85)",
    sidebarText: "rgba(255,255,255,0.92)",
    subtleText: "rgba(255,255,255,0.58)",
    panelBg: "rgba(255,255,255,0.055)",
    hoverBg: "rgba(255,255,255,0.08)",
  },
  light: {
    background: "#f6f3ea",
    ink: "#171717",
    selection: "rgba(0,0,0,0.28)",
    handle: "rgba(0,0,0,0.55)",
    sidebarBg: "rgba(255,255,255,0.88)",
    sidebarText: "rgba(15,15,15,0.92)",
    subtleText: "rgba(15,15,15,0.58)",
    panelBg: "rgba(0,0,0,0.045)",
    hoverBg: "rgba(0,0,0,0.06)",
  },
} as const;

const DEFAULT_STATE: BoardState = {
  objects: [],
  selectedIds: [],
  currentTool: "text",
  viewport: { scale: 1, offsetX: 0, offsetY: 0 },
  settings: {
    themeMode: "dark",
    smartSnapEnabled: true,
    eraserMode: "stroke",
    chalkTexture: true,
    defaultFontSize: 96,
    snapDelayMs: 450,
    angleSnapEnabled: true,
    angleSnapIncrementDegrees: 45,
    angleSnapThresholdDegrees: 8,
    rotationSnapEnabled: false,
    rotationSnapIncrementDegrees: 15,
  },
};

let runtimeBoardState: BoardState = DEFAULT_STATE;

const TOOL_LABELS: Array<{ id: SidebarAction; label: string; icon: string }> = [
  { id: "select", label: "Select / Move", icon: "↖" },
  { id: "text", label: "Text", icon: "T" },
  { id: "draw", label: "Draw", icon: "⌁" },
  { id: "erase", label: "Erase", icon: "⌫" },
  { id: "shape", label: "Smart Shape", icon: "△" },
  { id: "pan", label: "Pan", icon: "" },
  { id: "library", label: "Library", icon: "" },
  { id: "find", label: "Smart Find", icon: "" },
  { id: "clear", label: "Clear Board", icon: "⌧" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function Ghostboard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const libraryRef = useRef<GreyboardLibrary>(loadLibrary());
  const boardRef = useRef<BoardState>(stateFromBoard(activeLibraryBoard(libraryRef.current)));
  const interactionRef = useRef<Interaction>(EMPTY_INTERACTION);
  const historyRef = useRef<BoardObject[][]>([]);
  const redoRef = useRef<BoardObject[][]>([]);
  const rafRef = useRef<number | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const smartFindInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSnapRef = useRef<PendingSnap | null>(null);
  const activeEditorRef = useRef<EditorState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const touchPointersRef = useRef<Map<number, Point>>(new Map());
  const touchGestureRef = useRef<TouchGesture | null>(null);
  const hasStoredInboxPanelRef = useRef(hasStoredInboxPanel());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [inputGuideMode, setInputGuideMode] = useState<InputGuideMode>(activeLibraryBoard(libraryRef.current).inputGuideMode ?? "mouse");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [smartFind, setSmartFind] = useState<SmartFindState>(SMART_FIND_EMPTY);
  const [inbox, setInbox] = useState<InboxState>({ todos: [], accounts: [], loading: true, error: "", errorCode: "" });
  const [inboxStatus, setInboxStatus] = useState<InboxStatusState>(loadInboxStatus());
  const [expandedInboxId, setExpandedInboxId] = useState<string | null>(null);
  const [inboxPanel, setInboxPanel] = useState<InboxPanelState>(loadInboxPanel());
  const [accountLegendOpen, setAccountLegendOpen] = useState(false);
  const [setupNotesOpen, setSetupNotesOpen] = useState(false);
  const [openInboxRailId, setOpenInboxRailId] = useState<string | null>(null);
  const [swipingInbox, setSwipingInbox] = useState<{ id: string; offset: number } | null>(null);
  const [inboxPreview, setInboxPreview] = useState<InboxPreviewState>({ byTodoId: {}, openTodoId: null, loadingTodoId: null, errorByTodoId: {} });
  const [libraryTick, setLibraryTick] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(navigator.onLine ? "saved" : "offline");
  const [titleDraft, setTitleDraft] = useState(activeLibraryBoard(libraryRef.current).title);
  const [titleEditing, setTitleEditing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tick, setTick] = useState(0);
  runtimeBoardState = boardRef.current;
  activeEditorRef.current = editor;

  const selectedObject = useMemo(() => {
    const state = boardRef.current;
    return state.objects.find((object) => object.id === state.selectedIds[0]) ?? null;
  }, [tick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const canvasWidth = usableCanvasWidth(inboxPanel);
      canvas.width = Math.floor(canvasWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      requestRender();
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [inboxPanel.isOpen, inboxPanel.width]);

  useEffect(() => {
    requestRender();
  }, [tick, editor]);

  useEffect(() => {
    if (!editor) return;
    const textarea = editorRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [editor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement === editorRef.current) {
        if (event.key === "Escape") {
          commitEditor();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSmartFind();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        openLibrary();
        return;
      }

      if (event.key === "Escape") {
        if (openInboxRailId) {
          event.preventDefault();
          setOpenInboxRailId(null);
          setSwipingInbox(null);
          return;
        }
        if (inboxPanel.isOpen) {
          event.preventDefault();
          updateInboxPanel({ isOpen: false });
          return;
        }
        if (libraryOpen) {
          event.preventDefault();
          setLibraryOpen(false);
          return;
        }
        if (smartFind.isOpen) {
          event.preventDefault();
          closeSmartFind();
          return;
        }
        if (contextMenu) {
          event.preventDefault();
          setContextMenu(null);
          return;
        }
        if (sidebarOpen || settingsOpen) {
          event.preventDefault();
          setSidebarOpen(false);
          setSettingsOpen(false);
          setClearConfirmOpen(false);
        }
        return;
      }

      if (event.key === "Enter" && clearConfirmOpen) {
        event.preventDefault();
        confirmClearBoard();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelectionToClipboard();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteFromClipboard();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearConfirmOpen, contextMenu, editor, inboxPanel.isOpen, libraryOpen, openInboxRailId, settingsOpen, sidebarOpen, smartFind]);

  useEffect(() => {
    if (!smartFind.isOpen) return;
    smartFindInputRef.current?.focus({ preventScroll: true });
  }, [smartFind.isOpen]);

  useEffect(() => {
    void fetchInboxTodos();
  }, []);

  useEffect(() => {
    const persist = () => save();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persist();
    };
    const onOnline = () => setSaveStatus("saved");
    const onOffline = () => setSaveStatus("offline");
    window.addEventListener("beforeunload", persist);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", persist);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [inputGuideMode]);

  function forceUpdate() {
    setTick((value) => value + 1);
  }

  function requestRender() {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  }

  function save() {
    if (!navigator.onLine) setSaveStatus("offline");
    else setSaveStatus("saving");
    try {
      const { objects, viewport, settings } = boardRef.current;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, viewport, settings }));
      const library = libraryRef.current;
      const active = activeLibraryBoard(library);
      const updated: GreyboardBoard = {
        ...active,
        objects: cloneObjects(objects),
        viewport: { ...viewport },
        settings: { ...settings },
        inputGuideMode,
        updatedAt: new Date().toISOString(),
      };
      library.boards[updated.id] = updated;
      library.activeBoardId = updated.id;
      saveLibrary(library);
      setSaveStatus(navigator.onLine ? "saved" : "offline");
    } catch {
      setSaveStatus("error");
      showToast("Could not save locally");
    }
  }

  async function fetchInboxTodos() {
    setInbox((current) => ({ ...current, loading: true, error: "", errorCode: "" }));
    try {
      const result = USE_MOCK_INBOX ? mockInboxResult() : await fetchInboxTodosFromApi();
      const todos = applyInboxStatus(result.todos, inboxStatus);
      setInbox({
        todos,
        accounts: result.accounts,
        loading: false,
        error: "",
        errorCode: "",
        lastUpdated: new Date().toISOString(),
      });
      applyDefaultInboxPanelState(todos);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load inbox todos.";
      setInbox({
        todos: [],
        accounts: [],
        loading: false,
        error: message,
        errorCode: message === "Gmail integration not configured" ? "config_missing" : "error",
        lastUpdated: new Date().toISOString(),
      });
    }
  }

  function setTodoStatus(todoId: string, status: "done" | "dismissed") {
    const timestamp = new Date().toISOString();
    const next: InboxStatusState = {
      done: { ...inboxStatus.done },
      dismissed: { ...inboxStatus.dismissed },
    };
    if (status === "done") next.done[todoId] = timestamp;
    if (status === "dismissed") next.dismissed[todoId] = timestamp;
    setInboxStatus(next);
    saveInboxStatus(next);
    setInbox((current) => ({ ...current, todos: applyInboxStatus(current.todos, next) }));
    setOpenInboxRailId(null);
    setSwipingInbox(null);
    showToast(status === "done" ? "Marked done" : "Hidden");
  }

  function restoreTodoStatus(todoId: string) {
    setInboxStatus((current) => {
      const next: InboxStatusState = {
        done: { ...current.done },
        dismissed: { ...current.dismissed },
      };
      delete next.done[todoId];
      delete next.dismissed[todoId];
      saveInboxStatus(next);
      setInbox((inboxCurrent) => ({ ...inboxCurrent, todos: applyInboxStatus(inboxCurrent.todos, next) }));
      return next;
    });
    showToast("Restored");
  }

  function hideInboxTodoWithUndo(todo: InboxTodo) {
    setTodoStatus(todo.id, "dismissed");
    showToast("Hidden", {
      actionLabel: "Undo",
      action: () => restoreTodoStatus(todo.id),
    });
  }

  function updateInboxPanel(patch: Partial<InboxPanelState>) {
    setInboxPanel((current) => {
      const next = {
        ...current,
        ...patch,
        width: clampInboxPanelWidth(patch.width ?? current.width),
      };
      localStorage.setItem(INBOX_PANEL_STORAGE_KEY, JSON.stringify(next));
      hasStoredInboxPanelRef.current = true;
      return next;
    });
  }

  function applyDefaultInboxPanelState(todos: InboxTodo[]) {
    if (hasStoredInboxPanelRef.current || !isDesktopInboxPanel()) return;
    const next = { width: INBOX_PANEL_DEFAULT_WIDTH, isOpen: visibleInboxTodos(todos).length > 0 };
    setInboxPanel(next);
    localStorage.setItem(INBOX_PANEL_STORAGE_KEY, JSON.stringify(next));
    hasStoredInboxPanelRef.current = true;
  }

  function startInboxPanelResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inboxPanel.width;
    document.body.classList.add("is-resizing-inbox");
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampInboxPanelWidth(startWidth + startX - moveEvent.clientX);
      setInboxPanel((current) => ({ ...current, width: nextWidth }));
    };
    const onPointerUp = (upEvent: PointerEvent) => {
      const nextWidth = clampInboxPanelWidth(startWidth + startX - upEvent.clientX);
      document.body.classList.remove("is-resizing-inbox");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      updateInboxPanel({ width: nextWidth });
      requestRender();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function addInboxTodoToBoard(todo: InboxTodo) {
    commitEditor();
    const existing = boardRef.current.objects.find((object) =>
      object.metadata?.source === "scheduled_inbox" && object.metadata?.inboxTodoId === todo.id,
    );
    if (existing) {
      boardRef.current.selectedIds = [existing.id];
      zoomToBounds(expandRect(objectBounds(existing), 90), { duration: 500, paddingPx: 160, maxScale: 1.25 });
      showToast("Already on this board");
      requestRender();
      forceUpdate();
      return;
    }

    const before = cloneObjects(boardRef.current.objects);
    const viewport = boardRef.current.viewport;
    const center = screenToWorld({ x: usableCanvasWidth(inboxPanel) / 2, y: window.innerHeight / 2 }, viewport);
    const inboxCount = boardRef.current.objects.filter((object) => object.metadata?.source === "scheduled_inbox").length;
    const offset = (inboxCount % 5) * 46;
    const text: TextObject = {
      id: createId(),
      type: "text",
      x: center.x - 360 + offset,
      y: center.y - 180 + offset,
      width: 720,
      height: 360,
      rotation: 0,
      text: formatInboxTodoText(todo),
      fontSize: Math.max(42, Math.min(boardRef.current.settings.defaultFontSize, 58)),
      lineHeight: 1.18,
      color: DEFAULT_INK,
      opacity: 0.96,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      label: todo.title,
      note: [todo.reason, todo.suggestedAction, todo.suggestedDraft, todo.contactName, todo.subject].filter(Boolean).join(" "),
      metadata: {
        source: "scheduled_inbox",
        inboxTodoId: todo.id,
        emailThreadId: todo.emailThreadId,
        emailMessageId: todo.emailMessageId,
        gmailUrl: todo.gmailUrl,
        dueDate: todo.dueDate,
        urgency: todo.urgency,
        contactName: todo.contactName,
        subject: todo.subject,
        accountId: todo.accountId,
        accountLabel: todo.accountLabel,
        accountEmail: todo.accountEmail,
      },
    };
    const metrics = measureTextBox(text);
    text.height = Math.max(text.height, metrics.height + 24);
    boardRef.current.objects = [...boardRef.current.objects, text];
    boardRef.current.selectedIds = [text.id];
    boardRef.current.currentTool = "select";
    pushHistory(before);
    save();
    requestRender();
    forceUpdate();
    showToast("Added email todo");
  }

  async function copyInboxDraft(todo: InboxTodo) {
    if (!todo.suggestedDraft) return;
    try {
      await navigator.clipboard.writeText(todo.suggestedDraft);
      showToast("Draft copied");
    } catch {
      showToast("Could not copy draft");
    }
  }

  async function fetchInboxEmailPreview(todo: InboxTodo) {
    if (!todo.emailMessageId || !todo.accountId) {
      showToast("No email preview available");
      return;
    }
    if (inboxPreview.openTodoId === todo.id) {
      setInboxPreview((current) => ({ ...current, openTodoId: null }));
      return;
    }
    if (inboxPreview.byTodoId[todo.id]) {
      setInboxPreview((current) => ({ ...current, openTodoId: todo.id }));
      return;
    }
    setInboxPreview((current) => ({ ...current, loadingTodoId: todo.id, errorByTodoId: { ...current.errorByTodoId, [todo.id]: "" } }));
    try {
      const preview = await fetchInboxEmailPreviewFromApi(todo);
      setInboxPreview((current) => ({
        byTodoId: { ...current.byTodoId, [todo.id]: preview },
        openTodoId: todo.id,
        loadingTodoId: null,
        errorByTodoId: { ...current.errorByTodoId, [todo.id]: "" },
      }));
    } catch {
      setInboxPreview((current) => ({
        ...current,
        loadingTodoId: null,
        errorByTodoId: { ...current.errorByTodoId, [todo.id]: "Could not load email preview." },
      }));
    }
  }

  function inboxActionsForTodo(todo: InboxTodo) {
    return [
      { id: "done", label: "Done", icon: "✓", run: () => setTodoStatus(todo.id, "done") },
      { id: "dismiss", label: "Hide", icon: "×", run: () => setTodoStatus(todo.id, "dismissed") },
      { id: "board", label: "Add to board", icon: "+", run: () => addInboxTodoToBoard(todo) },
      ...(todo.gmailUrl ? [{ id: "gmail", label: "Open Gmail", icon: "↗", run: () => window.open(todo.gmailUrl, "_blank", "noopener,noreferrer") }] : []),
      ...(todo.suggestedDraft ? [{ id: "copy", label: "Copy draft", icon: "⧉", run: () => void copyInboxDraft(todo) }] : []),
    ];
  }

  function handleInboxItemWheel(event: React.WheelEvent, todo: InboxTodo) {
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.25) return;
    event.preventDefault();
    event.stopPropagation();
    if (Math.abs(event.deltaX) > 64) {
      hideInboxTodoWithUndo(todo);
      return;
    }
    const actionCount = inboxActionsForTodo(todo).length;
    const maxOffset = Math.min(220, actionCount * 44);
    const currentOffset = swipingInbox?.id === todo.id ? swipingInbox.offset : openInboxRailId === todo.id ? maxOffset : 0;
    const nextOffset = Math.max(0, Math.min(maxOffset, currentOffset + event.deltaX));
    setOpenInboxRailId(null);
    setSwipingInbox({ id: todo.id, offset: nextOffset });
    window.clearTimeout((handleInboxItemWheel as unknown as { settleTimer?: number }).settleTimer);
    (handleInboxItemWheel as unknown as { settleTimer?: number }).settleTimer = window.setTimeout(() => {
      setOpenInboxRailId(nextOffset > 56 ? todo.id : null);
      setSwipingInbox(null);
    }, 120);
  }

  function openLibrary() {
    commitEditor();
    setSidebarOpen(false);
    setSettingsOpen(false);
    setContextMenu(null);
    closeSmartFind();
    save();
    setLibraryOpen(true);
  }

  function openBoard(boardId: string) {
    save();
    const board = libraryRef.current.boards[boardId];
    if (!board) return;
    libraryRef.current.activeBoardId = boardId;
    boardRef.current = stateFromBoard(board);
    setInputGuideMode(board.inputGuideMode ?? "mouse");
    setTitleDraft(board.title);
    setTitleEditing(false);
    saveLibrary(libraryRef.current);
    setLibraryOpen(false);
    setSidebarOpen(false);
    closeSmartFind();
    requestRender();
    forceUpdate();
    setLibraryTick((value) => value + 1);
  }

  function createNewBoard() {
    save();
    const board = createLibraryBoard("Untitled Greyboard");
    libraryRef.current.boards[board.id] = board;
    libraryRef.current.activeBoardId = board.id;
    boardRef.current = stateFromBoard(board);
    setInputGuideMode(board.inputGuideMode ?? "mouse");
    setTitleDraft(board.title);
    setTitleEditing(false);
    saveLibrary(libraryRef.current);
    setLibraryOpen(false);
    requestRender();
    forceUpdate();
    setLibraryTick((value) => value + 1);
  }

  function renameBoard(boardId: string, title: string) {
    const board = libraryRef.current.boards[boardId];
    if (!board) return;
    board.title = title.trim() || "Untitled Greyboard";
    board.updatedAt = new Date().toISOString();
    saveLibrary(libraryRef.current);
    if (boardId === libraryRef.current.activeBoardId) setTitleDraft(board.title);
    setLibraryTick((value) => value + 1);
  }

  function commitActiveBoardTitle() {
    const board = activeLibraryBoard(libraryRef.current);
    renameBoard(board.id, titleDraft);
    setTitleEditing(false);
    setSaveStatus("saved");
  }

  function cancelActiveBoardTitleEdit() {
    setTitleDraft(activeLibraryBoard(libraryRef.current).title);
    setTitleEditing(false);
  }

  function duplicateBoard(boardId: string) {
    const board = libraryRef.current.boards[boardId];
    if (!board) return;
    const now = new Date().toISOString();
    const copy: GreyboardBoard = {
      ...board,
      id: createId(),
      title: `${board.title} copy`,
      createdAt: now,
      updatedAt: now,
      objects: cloneObjects(board.objects),
      viewport: { ...board.viewport },
      settings: { ...board.settings },
    };
    libraryRef.current.boards[copy.id] = copy;
    saveLibrary(libraryRef.current);
    setLibraryTick((value) => value + 1);
    showToast("Board duplicated");
  }

  function deleteBoard(boardId: string) {
    const board = libraryRef.current.boards[boardId];
    if (!board) return;
    if (!window.confirm(`Delete "${board.title}"?`)) return;
    delete libraryRef.current.boards[boardId];
    const remaining = Object.values(libraryRef.current.boards);
    if (!remaining.length) {
      const next = createLibraryBoard("Untitled Greyboard");
      libraryRef.current.boards[next.id] = next;
      libraryRef.current.activeBoardId = next.id;
      boardRef.current = stateFromBoard(next);
      setInputGuideMode(next.inputGuideMode ?? "mouse");
      setTitleDraft(next.title);
    } else if (libraryRef.current.activeBoardId === boardId) {
      libraryRef.current.activeBoardId = remaining[0].id;
      boardRef.current = stateFromBoard(remaining[0]);
      setInputGuideMode(remaining[0].inputGuideMode ?? "mouse");
      setTitleDraft(remaining[0].title);
    }
    saveLibrary(libraryRef.current);
    requestRender();
    forceUpdate();
    setLibraryTick((value) => value + 1);
  }

  function setTool(tool: Tool) {
    commitEditor();
    setClearConfirmOpen(false);
    boardRef.current.currentTool = tool;
    setSidebarOpen(false);
    save();
    forceUpdate();
  }

  function openSmartFind() {
    commitEditor();
    setSidebarOpen(false);
    setSettingsOpen(false);
    setContextMenu(null);
    setSmartFind((current) => ({ ...current, isOpen: true }));
    requestRender();
  }

  function closeSmartFind() {
    setSmartFind(SMART_FIND_EMPTY);
    requestRender();
  }

  function updateSmartFindQuery(query: string) {
    const results = query.trim() ? buildSearchResults(boardRef.current.objects, query) : [];
    setSmartFind({ isOpen: true, query, results, activeIndex: 0 });
    if (!query.trim()) {
      requestRender();
      return;
    }
    if (!results.length) {
      showToast("No matches yet");
      requestRender();
      return;
    }
    zoomOutToOverview(results.map((result) => result.bounds), { duration: 450 });
  }

  function submitSmartFind() {
    if (!smartFind.query.trim()) return;
    if (!smartFind.results.length) {
      showToast("No matches yet");
      return;
    }
    focusSearchResult(smartFind.results[smartFind.activeIndex] ?? smartFind.results[0]);
  }

  function cycleSmartFind(direction: number) {
    if (!smartFind.results.length) return;
    const nextIndex = (smartFind.activeIndex + direction + smartFind.results.length) % smartFind.results.length;
    const nextResult = smartFind.results[nextIndex];
    setSmartFind((current) => ({ ...current, activeIndex: nextIndex }));
    focusSearchResult(nextResult, 420);
  }

  function focusSearchResult(result: SearchResult, duration = 550) {
    boardRef.current.selectedIds = [result.objectId];
    zoomToBounds(expandRect(result.bounds, 80), { duration, paddingPx: 170, maxScale: 1.35 });
    requestRender();
    forceUpdate();
  }

  function zoomOutToOverview(boundsList: Rect[], options: { duration?: number } = {}) {
    if (!boundsList.length) return;
    const bounds = boundsList.reduce((rect, item) => unionRects(rect, item), boundsList[0]);
    zoomToBounds(expandRect(bounds, 360), { duration: options.duration ?? 450, paddingPx: 110, maxScale: 0.9 });
  }

  function zoomToBounds(bounds: Rect, options: { duration?: number; paddingPx?: number; maxScale?: number } = {}) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = getViewportForBounds(
      bounds,
      window.innerWidth,
      window.innerHeight,
      options.paddingPx ?? 120,
      options.maxScale ?? MAX_SCALE,
    );
    animateViewport(target, options.duration ?? 500);
  }

  function animateViewport(target: Viewport, duration: number) {
    if (cameraRafRef.current != null) window.cancelAnimationFrame(cameraRafRef.current);
    const viewport = boardRef.current.viewport;
    const start = { ...viewport };
    const startTime = window.performance.now();
    const tickCamera = (now: number) => {
      const t = clamp((now - startTime) / Math.max(duration, 1), 0, 1);
      const eased = easeInOutCubic(t);
      viewport.scale = lerp(start.scale, target.scale, eased);
      viewport.offsetX = lerp(start.offsetX, target.offsetX, eased);
      viewport.offsetY = lerp(start.offsetY, target.offsetY, eased);
      requestRender();
      forceUpdate();
      if (t < 1) {
        cameraRafRef.current = window.requestAnimationFrame(tickCamera);
      } else {
        cameraRafRef.current = null;
      }
    };
    cameraRafRef.current = window.requestAnimationFrame(tickCamera);
  }

  function pushHistory(before: BoardObject[]) {
    historyRef.current.push(cloneObjects(before));
    if (historyRef.current.length > 100) historyRef.current.shift();
    redoRef.current = [];
  }

  function cancelPendingSnap() {
    const pending = pendingSnapRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingSnapRef.current = null;
  }

  function setObjects(next: BoardObject[], before?: BoardObject[]) {
    if (before) pushHistory(before);
    boardRef.current.objects = next;
    save();
    forceUpdate();
  }

  function undo() {
    commitEditor();
    const previous = historyRef.current.pop();
    if (!previous) return;
    redoRef.current.push(cloneObjects(boardRef.current.objects));
    boardRef.current.objects = cloneObjects(previous);
    boardRef.current.selectedIds = [];
    save();
    forceUpdate();
  }

  function redo() {
    commitEditor();
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(cloneObjects(boardRef.current.objects));
    boardRef.current.objects = cloneObjects(next);
    boardRef.current.selectedIds = [];
    save();
    forceUpdate();
  }

  function clearBoard() {
    commitEditor();
    if (!boardRef.current.objects.length) return;
    setClearConfirmOpen(true);
  }

  function confirmClearBoard() {
    if (!boardRef.current.objects.length) {
      setClearConfirmOpen(false);
      return;
    }
    setObjects([], boardRef.current.objects);
    setSidebarOpen(false);
    setSettingsOpen(false);
    setClearConfirmOpen(false);
  }

  function deleteSelection() {
    commitEditor();
    const ids = new Set(boardRef.current.selectedIds);
    if (!ids.size) return;
    const before = boardRef.current.objects;
    boardRef.current.selectedIds = [];
    setObjects(before.filter((object) => !ids.has(object.id)), before);
  }

  function rememberTouchPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.set(event.pointerId, eventPoint(event));
  }

  function forgetTouchPointer(pointerId: number) {
    touchPointersRef.current.delete(pointerId);
    const gesture = touchGestureRef.current;
    if (gesture?.pointerIds.includes(pointerId)) touchGestureRef.current = null;
  }

  function beginTouchGesture() {
    const entries = [...touchPointersRef.current.entries()];
    if (entries.length < 2) return false;
    const [first, second] = entries.slice(-2);
    const firstPoint = first[1];
    const secondPoint = second[1];
    const center = midpoint(firstPoint, secondPoint);
    touchGestureRef.current = {
      pointerIds: [first[0], second[0]],
      initialCenter: center,
      initialDistance: Math.max(distance(firstPoint, secondPoint), 1),
      initialScale: boardRef.current.viewport.scale,
      initialWorldCenter: screenToWorld(center, boardRef.current.viewport),
    };
    interactionRef.current = EMPTY_INTERACTION;
    commitEditor();
    cancelPendingSnap();
    return true;
  }

  function updateTouchGesture() {
    const gesture = touchGestureRef.current;
    if (!gesture) return false;
    const first = touchPointersRef.current.get(gesture.pointerIds[0]);
    const second = touchPointersRef.current.get(gesture.pointerIds[1]);
    if (!first || !second) return false;
    const center = midpoint(first, second);
    const nextScale = clamp(gesture.initialScale * (distance(first, second) / gesture.initialDistance), MIN_SCALE, MAX_SCALE);
    const viewport = boardRef.current.viewport;
    viewport.scale = nextScale;
    viewport.offsetX = center.x - gesture.initialWorldCenter.x * nextScale;
    viewport.offsetY = center.y - gesture.initialWorldCenter.y * nextScale;
    save();
    requestRender();
    forceUpdate();
    return true;
  }

  function showToast(message: string, options: Pick<ToastState, "actionLabel" | "action"> = {}) {
    setToast({ message, ...options });
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, options.action ? 3600 : 1300);
  }

  function selectionIdsForObject(object: BoardObject, objects = boardRef.current.objects) {
    if (!object.groupId) return [object.id];
    return objects.filter((item) => item.groupId === object.groupId).map((item) => item.id);
  }

  function groupSelection() {
    commitEditor();
    const state = boardRef.current;
    const selected = new Set(state.selectedIds);
    if (selected.size < 2) {
      setContextMenu(null);
      return;
    }
    const before = cloneObjects(state.objects);
    const groupId = createId();
    const now = Date.now();
    state.objects = state.objects.map((object) =>
      selected.has(object.id) ? { ...object, groupId, updatedAt: now } : object,
    );
    pushHistory(before);
    save();
    setContextMenu(null);
    showToast("Grouped - they move together now");
    requestRender();
    forceUpdate();
  }

  function ungroupSelection() {
    commitEditor();
    const state = boardRef.current;
    const selected = new Set(state.selectedIds);
    const groupIds = new Set(
      state.objects
        .filter((object) => selected.has(object.id) && object.groupId)
        .map((object) => object.groupId as string),
    );
    if (!groupIds.size) {
      setContextMenu(null);
      return;
    }
    const before = cloneObjects(state.objects);
    const now = Date.now();
    const ungroupedIds = state.objects
      .filter((object) => selected.has(object.id) || (object.groupId && groupIds.has(object.groupId)))
      .map((object) => object.id);
    state.objects = state.objects.map((object) =>
      object.groupId && groupIds.has(object.groupId)
        ? { ...object, groupId: undefined, updatedAt: now }
        : object,
    );
    state.selectedIds = ungroupedIds;
    pushHistory(before);
    save();
    setContextMenu(null);
    showToast("Ungrouped - pieces are free");
    requestRender();
    forceUpdate();
  }

  async function copySelectionToClipboard() {
    commitEditor();
    const selected = boardRef.current.objects.filter((object) => boardRef.current.selectedIds.includes(object.id));
    if (!selected.length) return;
    const payload = `${CLIPBOARD_PREFIX}${JSON.stringify({ objects: selected })}`;
    localStorage.setItem(LOCAL_CLIPBOARD_KEY, payload);
    try {
      const image = renderObjectsToPng(selected, boardRef.current.settings);
      if ("ClipboardItem" in window && image) {
        const htmlPayload = `<!--${CLIPBOARD_HTML_PREFIX}${window.btoa(unescape(encodeURIComponent(payload)))}--><img src="${image.dataUrl}" alt="Greyboard selection">`;
        await withTimeout(navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([htmlPayload], { type: "text/html" }),
            "image/png": image.blob,
          }),
        ]), 900);
        showToast("Copied - ready to drop anywhere");
      } else {
        showToast("Copied inside Greyboard");
      }
    } catch {
      try {
        const image = renderObjectsToPng(selected, boardRef.current.settings);
        if ("ClipboardItem" in window && image) {
          await withTimeout(navigator.clipboard.write([new ClipboardItem({ "image/png": image.blob })]), 900);
          showToast("Copied - ready to drop anywhere");
        } else {
          showToast("Copied inside Greyboard");
        }
      } catch {
        showToast("Copied inside Greyboard");
      }
    }
  }

  async function pasteFromClipboard() {
    commitEditor();
    let text = "";
    try {
      if ("read" in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const html = await (await item.getType("text/html")).text();
            text = extractGreyboardPayloadFromHtml(html);
            break;
          }
        }
      }
      if (!text) text = await navigator.clipboard.readText();
    } catch {
      text = localStorage.getItem(LOCAL_CLIPBOARD_KEY) ?? "";
    }
    if (!text) text = localStorage.getItem(LOCAL_CLIPBOARD_KEY) ?? "";
    if (!text.startsWith(CLIPBOARD_PREFIX)) return;
    try {
      const parsed = JSON.parse(text.slice(CLIPBOARD_PREFIX.length)) as { objects?: BoardObject[] };
      if (!Array.isArray(parsed.objects) || !parsed.objects.length) return;
      const before = cloneObjects(boardRef.current.objects);
      const groupIdMap = new Map<string, string>();
      const pasted = cloneObjects(parsed.objects).map((object) => {
        object.id = createId();
        if (object.groupId) {
          if (!groupIdMap.has(object.groupId)) groupIdMap.set(object.groupId, createId());
          object.groupId = groupIdMap.get(object.groupId);
        }
        object.createdAt = Date.now();
        object.updatedAt = Date.now();
        applyMove(object, object, 32, 32);
        return object;
      });
      boardRef.current.objects = [...boardRef.current.objects, ...pasted];
      boardRef.current.selectedIds = pasted.map((object) => object.id);
      pushHistory(before);
      save();
      requestRender();
      forceUpdate();
      showToast("Pasted");
    } catch {
      return;
    }
  }

  function commitEditor() {
    const active = activeEditorRef.current;
    if (!active) return;
    activeEditorRef.current = null;
    let current = boardRef.current.objects;
    const edited = current.find((object) => object.id === active.id);
    if (edited?.type === "text" && !edited.text.trim()) {
      current = current.filter((object) => object.id !== active.id);
      boardRef.current.objects = current;
      boardRef.current.selectedIds = boardRef.current.selectedIds.filter((id) => id !== active.id);
    } else {
      boardRef.current.selectedIds = active.isNew ? [active.id] : [];
    }
    if (JSON.stringify(active.startObjects) !== JSON.stringify(current)) {
      pushHistory(active.startObjects);
    }
    setEditor(null);
    save();
    forceUpdate();
    requestRender();
  }

  function startEditing(id: string, startObjects = cloneObjects(boardRef.current.objects), isNew = false) {
    const object = boardRef.current.objects.find((item) => item.id === id);
    if (!object || object.type !== "text") return;
    boardRef.current.selectedIds = [];
    const nextEditor = { id, startObjects, ignoreNextCanvasDown: false, isNew };
    activeEditorRef.current = nextEditor;
    setEditor(nextEditor);
    forceUpdate();
  }

  function updateText(id: string, text: string) {
    const object = boardRef.current.objects.find((item) => item.id === id);
    if (!object || object.type !== "text") return;
    object.text = text;
    object.updatedAt = Date.now();
    const metrics = measureTextBox(object);
    object.width = Math.max(object.width, metrics.minWidth);
    object.height = Math.max(object.height, metrics.minHeight, object.fontSize * 1.35);
    save();
    forceUpdate();
    requestRender();
  }

  function applyTextEditorChange(id: string, nextText: string, nextCursor: number) {
    updateText(id, nextText);
    window.requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleTextEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, object: TextObject) {
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = value.indexOf("\n", start);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const lineBeforeCursor = value.slice(lineStart, start);
    const currentLine = value.slice(lineStart, lineEnd);

    if (event.key === " " && start === end && lineBeforeCursor === "-") {
      event.preventDefault();
      const next = `${value.slice(0, lineStart)}• ${value.slice(start)}`;
      applyTextEditorChange(object.id, next, lineStart + 2);
      return;
    }

    if (event.key === "Enter" && start === end && currentLine.startsWith("• ")) {
      event.preventDefault();
      if (currentLine.trim() === "•") {
        const next = `${value.slice(0, lineStart)}\n${value.slice(lineEndIndex === -1 ? lineEnd : lineEnd + 1)}`;
        applyTextEditorChange(object.id, next, lineStart + 1);
      } else {
        const next = `${value.slice(0, start)}\n• ${value.slice(end)}`;
        applyTextEditorChange(object.id, next, start + 3);
      }
    }
  }

  function createTextAt(world: Point) {
    commitEditor();
    const before = cloneObjects(boardRef.current.objects);
    const text: TextObject = {
      id: createId(),
      type: "text",
      x: world.x,
      y: world.y,
      width: 520,
      height: 130,
      rotation: 0,
      text: "",
      fontSize: boardRef.current.settings.defaultFontSize,
      lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
      color: DEFAULT_INK,
      opacity: 0.96,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    boardRef.current.objects = [...boardRef.current.objects, text];
    boardRef.current.selectedIds = [];
    save();
    startEditing(text.id, before, true);
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rememberTouchPointer(event);
    if (event.pointerType === "touch" && touchPointersRef.current.size >= 2) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      beginTouchGesture();
      return;
    }

    const screen = eventPoint(event);
    const world = screenToWorld(screen, boardRef.current.viewport);
    const state = boardRef.current;
    const isMiddlePan = event.button === 1;
    const isRightErase = event.button === 2;

    if (event.button === 0 && contextMenu) setContextMenu(null);

    if (editor) {
      event.preventDefault();
      commitEditor();
      return;
    }

    if (sidebarOpen && event.button === 0) {
      event.preventDefault();
      setSidebarOpen(false);
      setSettingsOpen(false);
      return;
    }

    if (isRightErase && state.selectedIds.length > 1) {
      const hit = hitTest(world);
      if (hit && state.selectedIds.includes(hit.id)) {
        event.preventDefault();
        setContextMenu({ x: screen.x, y: screen.y });
        return;
      }
    }

    if (isMiddlePan || state.currentTool === "pan") {
      cancelPendingSnap();
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = { type: "pan", pointerId: event.pointerId, last: screen };
      return;
    }

    if (isRightErase) {
      cancelPendingSnap();
      event.preventDefault();
      commitEditor();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: "erase",
        pointerId: event.pointerId,
        erasedIds: new Set(),
        before: cloneObjects(state.objects),
        cursor: world,
        deleteText: event.shiftKey,
      };
      return;
    }

    if (event.button !== 0) return;
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      cancelPendingSnap();
      commitEditor();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = { type: "select-box", pointerId: event.pointerId, start: world, current: world };
      state.selectedIds = [];
      requestRender();
      forceUpdate();
      return;
    }

    if (event.detail >= 2) {
      const hit = hitTest(world);
      if (hit?.type === "text") {
        cancelPendingSnap();
        startEditing(hit.id);
        return;
      }
    }

    if (state.currentTool === "draw" || state.currentTool === "shape") {
      cancelPendingSnap();
      commitEditor();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: "draw",
        pointerId: event.pointerId,
        points: [{ ...world, pressure: event.pressure || 0.5, t: Date.now() }],
        forceAngleSnap: event.shiftKey,
      };
      return;
    }

    if (state.currentTool === "erase") {
      cancelPendingSnap();
      commitEditor();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: "erase",
        pointerId: event.pointerId,
        erasedIds: new Set(),
        before: cloneObjects(state.objects),
        cursor: world,
        deleteText: event.shiftKey,
      };
      eraseAt(world);
      return;
    }

    const handle = state.selectedIds.length === 1 ? hitSelectionHandle(world) : null;
    if (handle && selectedObject) {
      cancelPendingSnap();
      commitEditor();
      canvas.setPointerCapture(event.pointerId);
      if (handle === "rotate") {
        const origin = objectRotationOrigin(selectedObject);
        interactionRef.current = {
          type: "rotate",
          pointerId: event.pointerId,
          id: selectedObject.id,
          origin,
          initialPointerAngle: angleBetween(origin, world),
          objectStart: cloneObject(selectedObject),
          before: cloneObjects(state.objects),
        };
      } else {
        interactionRef.current = {
          type: "resize",
          pointerId: event.pointerId,
          id: selectedObject.id,
          handle,
          start: world,
          objectStart: cloneObject(selectedObject),
          before: cloneObjects(state.objects),
        };
      }
      return;
    }

    const hit = hitTest(world);
    if (hit) {
      cancelPendingSnap();
      commitEditor();
      const selectedIds = state.selectedIds.includes(hit.id) ? state.selectedIds : selectionIdsForObject(hit, state.objects);
      state.selectedIds = selectedIds;
      forceUpdate();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: "move",
        pointerId: event.pointerId,
        ids: selectedIds,
        start: world,
        objectStarts: cloneObjects(state.objects.filter((object) => selectedIds.includes(object.id))),
        before: cloneObjects(state.objects),
      };
      return;
    }

    if (state.currentTool === "text") {
      cancelPendingSnap();
      commitEditor();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = {
        type: "pending-canvas",
        pointerId: event.pointerId,
        startScreen: screen,
        startWorld: world,
        startedAt: Date.now(),
        forceAngleSnap: event.shiftKey,
      };
      return;
    }

    if (state.currentTool === "select") {
      cancelPendingSnap();
      commitEditor();
      state.selectedIds = [];
      forceUpdate();
      return;
    }

    cancelPendingSnap();
    createTextAt(world);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, eventPoint(event));
      if (updateTouchGesture()) {
        event.preventDefault();
        return;
      }
    }
    const interaction = interactionRef.current;
    const screen = eventPoint(event);
    const world = screenToWorld(screen, boardRef.current.viewport);

    if (interaction.type === "none") {
      updateCanvasCursor(world);
      return;
    }

    if (interaction.type === "pan" && interaction.pointerId === event.pointerId) {
      const viewport = boardRef.current.viewport;
      viewport.offsetX += screen.x - interaction.last.x;
      viewport.offsetY += screen.y - interaction.last.y;
      interaction.last = screen;
      save();
      requestRender();
      forceUpdate();
      return;
    }

    if (interaction.type === "draw" && interaction.pointerId === event.pointerId) {
      if (event.shiftKey) interaction.forceAngleSnap = true;
      const last = interaction.points[interaction.points.length - 1];
      if (!last || distance(last, world) > 0.8) {
        interaction.points.push({ ...world, pressure: event.pressure || 0.5, t: Date.now() });
        requestRender();
      }
      return;
    }

    if (interaction.type === "pending-canvas" && interaction.pointerId === event.pointerId) {
      if (event.shiftKey) interaction.forceAngleSnap = true;
      if (distance(interaction.startScreen, screen) > DRAG_THRESHOLD_PX) {
        interactionRef.current = {
          type: "draw",
          pointerId: event.pointerId,
          points: [
            { ...interaction.startWorld, pressure: event.pressure || 0.5, t: interaction.startedAt },
            { ...world, pressure: event.pressure || 0.5, t: Date.now() },
          ],
          forceAngleSnap: interaction.forceAngleSnap,
        };
        requestRender();
      }
      return;
    }

    if (interaction.type === "select-box" && interaction.pointerId === event.pointerId) {
      interaction.current = world;
      requestRender();
      return;
    }

    if (interaction.type === "erase" && interaction.pointerId === event.pointerId) {
      interaction.cursor = world;
      eraseAt(world);
      return;
    }

    if (interaction.type === "move" && interaction.pointerId === event.pointerId) {
      const dx = world.x - interaction.start.x;
      const dy = world.y - interaction.start.y;
      for (const original of interaction.objectStarts) {
        const object = boardRef.current.objects.find((item) => item.id === original.id);
        if (object) applyMove(object, original, dx, dy);
      }
      save();
      requestRender();
      forceUpdate();
      return;
    }

    if (interaction.type === "resize" && interaction.pointerId === event.pointerId) {
      const object = boardRef.current.objects.find((item) => item.id === interaction.id);
      if (!object) return;
      applyResize(object, interaction.objectStart, interaction.handle, world.x - interaction.start.x, world.y - interaction.start.y);
      save();
      requestRender();
      forceUpdate();
      return;
    }

    if (interaction.type === "rotate" && interaction.pointerId === event.pointerId) {
      const object = boardRef.current.objects.find((item) => item.id === interaction.id);
      if (!object) return;
      const angle = angleBetween(interaction.origin, world);
      let rotation = (interaction.objectStart.rotation ?? 0) + angle - interaction.initialPointerAngle;
      const settings = boardRef.current.settings;
      if (event.shiftKey || settings.rotationSnapEnabled) {
        rotation = snapAngle(rotation, settings.rotationSnapIncrementDegrees || 15);
      }
      object.rotation = normalizeAngle(rotation);
      object.updatedAt = Date.now();
      save();
      requestRender();
      forceUpdate();
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    forgetTouchPointer(event.pointerId);
    if (event.pointerType === "touch" && touchGestureRef.current) return;

    if (interaction.type === "draw" && interaction.pointerId === event.pointerId) {
      const before = cloneObjects(boardRef.current.objects);
      const cleaned = smoothPoints(removeDuplicatePoints(interaction.points));
      if (cleaned.length > 1 && pathLength(cleaned) > 4) {
        const stroke = makeStroke(cleaned);
        boardRef.current.objects = [...boardRef.current.objects, stroke];
        boardRef.current.selectedIds = [stroke.id];
        pushHistory(before);
        save();
        scheduleSnap(stroke.id, cleaned, interaction.forceAngleSnap);
      }
    }

    if (interaction.type === "pending-canvas" && interaction.pointerId === event.pointerId) {
      const duration = Date.now() - interaction.startedAt;
      if (duration <= CLICK_MAX_DURATION_MS || distance(interaction.startScreen, eventPoint(event)) <= DRAG_THRESHOLD_PX) {
        createTextAt(interaction.startWorld);
      }
    }

    if (interaction.type === "select-box" && interaction.pointerId === event.pointerId) {
      const rect = normalizeRect(interaction.start, interaction.current);
      boardRef.current.selectedIds = boardRef.current.objects
        .filter((object) => rectsIntersect(expandRect(objectBounds(object), 6), rect))
        .map((object) => object.id);
      if (boardRef.current.selectedIds.length) boardRef.current.currentTool = "select";
      save();
    }

    if (interaction.type === "erase" && interaction.pointerId === event.pointerId && interaction.erasedIds.size) {
      pushHistory(interaction.before);
      save();
    }

    if ((interaction.type === "move" || interaction.type === "resize" || interaction.type === "rotate") && interaction.pointerId === event.pointerId) {
      if (JSON.stringify(interaction.before) !== JSON.stringify(boardRef.current.objects)) {
        pushHistory(interaction.before);
        save();
      }
    }

    interactionRef.current = EMPTY_INTERACTION;
    requestRender();
    forceUpdate();
  }

  function scheduleSnap(strokeId: string, points: Point[], forceAngleSnap: boolean) {
    const state = boardRef.current;
    if (!state.settings.smartSnapEnabled && state.currentTool !== "shape") return;
    const delay = clamp(state.settings.snapDelayMs, 0, 1500);
    pendingSnapRef.current = {
      strokeId,
      timer: window.setTimeout(() => {
        pendingSnapRef.current = null;
        const current = boardRef.current.objects;
        const target = current.find((object) => object.id === strokeId);
        if (!target || target.type !== "stroke") return;
        const recognized = recognizeShape(points, boardRef.current.settings, forceAngleSnap);
        if (!recognized) return;
        const before = cloneObjects(current);
        recognized.id = strokeId;
        recognized.createdAt = target.createdAt;
        recognized.sourceStrokeId = strokeId;
        recognized.rawStartPoint = target.rawStartPoint ?? points[0];
        recognized.rawEndPoint = target.rawEndPoint ?? points[points.length - 1];
        recognized.rawPoints = target.rawPoints ?? points;
        boardRef.current.objects = current.map((object) => object.id === strokeId ? recognized : object);
        boardRef.current.selectedIds = [strokeId];
        pushHistory(before);
        save();
        requestRender();
        forceUpdate();
      }, delay),
    };
  }

  function onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const hit = hitTest(screenToWorld(eventPoint(event), boardRef.current.viewport));
    if (hit?.type === "text") {
      startEditing(hit.id);
    }
  }

  function onWheel(event: WheelEvent) {
    const viewport = boardRef.current.viewport;
    const screen = eventPoint(event);

    if (event.ctrlKey) {
      event.preventDefault();
      const before = screenToWorld(screen, viewport);
      const zoom = Math.exp(-event.deltaY * 0.0015);
      const nextScale = clamp(viewport.scale * zoom, MIN_SCALE, MAX_SCALE);
      viewport.scale = nextScale;
      viewport.offsetX = screen.x - before.x * nextScale;
      viewport.offsetY = screen.y - before.y * nextScale;
    } else if (event.shiftKey) {
      event.preventDefault();
      viewport.offsetX -= event.deltaY || event.deltaX;
    } else {
      event.preventDefault();
      viewport.offsetX -= event.deltaX;
      viewport.offsetY -= event.deltaY;
    }

    save();
    requestRender();
    forceUpdate();
  }

  function eraseAt(world: Point) {
    const interaction = interactionRef.current;
    if (interaction.type !== "erase") return;
    const state = boardRef.current;
    const hit = [...state.objects].reverse().find((object) => hitObjectStroke(object, world, HIT_TOLERANCE / state.viewport.scale));
    if (!hit || interaction.erasedIds.has(hit.id)) return;
    if (hit.type === "text" && !interaction.deleteText) {
      state.selectedIds = [hit.id];
      requestRender();
      forceUpdate();
      return;
    }
    interaction.erasedIds.add(hit.id);
    state.objects = state.objects.filter((object) => object.id !== hit.id);
    state.selectedIds = state.selectedIds.filter((id) => id !== hit.id);
    requestRender();
    forceUpdate();
  }

  function updateCanvasCursor(world: Point) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = boardRef.current;
    const selected = state.selectedIds.length === 1 ? state.objects.find((object) => object.id === state.selectedIds[0]) : null;
    const handle = selected ? hitSelectionHandle(world) : null;
    if (handle) {
      canvas.style.cursor = cursorForHandle(handle);
      return;
    }
    const hit = hitTest(world);
    if (selected && hit?.id === selected.id && !editor) {
      canvas.style.cursor = "move";
      return;
    }
    canvas.style.cursor = "";
  }

  function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const state = boardRef.current;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const theme = currentTheme(state.settings);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.save();
    ctx.translate(state.viewport.offsetX, state.viewport.offsetY);
    ctx.scale(state.viewport.scale, state.viewport.scale);

    const activeEditorId = activeEditorRef.current?.id;
    const searchActive = smartFind.isOpen && Boolean(smartFind.query.trim()) && smartFind.results.length > 0;
    const searchMatchIds = new Set(smartFind.results.map((result) => result.objectId));
    for (const object of state.objects) {
      if (activeEditorId === object.id) continue;
      if (searchActive && !searchMatchIds.has(object.id)) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        renderObject(ctx, object, state.settings);
        ctx.restore();
        continue;
      }
      renderObject(ctx, object, state.settings);
    }

    const drawing = interactionRef.current.type === "draw" ? interactionRef.current.points : null;
    if (drawing && drawing.length > 1) {
      renderStrokePath(ctx, drawing, 7, resolveInk(DEFAULT_INK, state.settings), 0.86, true, "preview");
    }

    if (interactionRef.current.type === "erase") {
      renderEraserCursor(ctx, interactionRef.current.cursor, HIT_TOLERANCE / state.viewport.scale);
    }

    if (interactionRef.current.type === "select-box") {
      renderSelectBox(ctx, interactionRef.current.start, interactionRef.current.current, state.settings);
    }

    const selectedObjects = state.objects.filter((object) => state.selectedIds.includes(object.id) && activeEditorId !== object.id);
    for (const selected of selectedObjects) {
      renderSelection(ctx, selected, state.settings, state.selectedIds.length > 1);
    }
    if (searchActive) {
      renderSearchHighlights(ctx, smartFind.results, smartFind.activeIndex, state.settings, state.viewport);
    }
    ctx.restore();
  }

  const editorObject = editor ? boardRef.current.objects.find((object) => object.id === editor.id && object.type === "text") as TextObject | undefined : undefined;
  const editorStyle = editorObject ? makeEditorStyle(editorObject, boardRef.current.viewport) : undefined;
  const contextSelectedObjects = contextMenu
    ? boardRef.current.objects.filter((object) => boardRef.current.selectedIds.includes(object.id))
    : [];
  const canGroupSelection = contextSelectedObjects.length > 1;
  const canUngroupSelection = contextSelectedObjects.some((object) => object.groupId);
  const activeSearchResult = smartFind.results[smartFind.activeIndex];
  void libraryTick;
  const currentBoard = activeLibraryBoard(libraryRef.current);
  const libraryBoards = Object.values(libraryRef.current.boards).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visibleTodos = visibleInboxTodos(inbox.todos);

  const theme = currentTheme(boardRef.current.settings);
  return (
    <main
      className="ghostboard"
      data-tool={boardRef.current.currentTool}
      data-theme={boardRef.current.settings.themeMode}
      style={{
        "--gb-bg": theme.background,
        "--gb-ink": theme.ink,
        "--gb-selection": theme.selection,
        "--gb-handle": theme.handle,
        "--gb-sidebar-bg": theme.sidebarBg,
        "--gb-sidebar-text": theme.sidebarText,
        "--gb-subtle-text": theme.subtleText,
        "--gb-panel-bg": theme.panelBg,
        "--gb-hover-bg": theme.hoverBg,
      } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className="board-canvas"
        aria-label="Greyboard canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      />

      {editorObject && (
        <textarea
          ref={editorRef}
          className="text-editor"
          value={editorObject.text}
          style={editorStyle}
          placeholder=""
          spellCheck={false}
          onChange={(event) => updateText(editorObject.id, event.target.value)}
          onKeyDown={(event) => handleTextEditorKeyDown(event, editorObject)}
          onBlur={commitEditor}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
                toast.action?.();
              }}
            >
              {toast.actionLabel || "Undo"}
            </button>
          )}
        </div>
      )}

      {smartFind.isOpen && (
        <div className="smart-find" role="search">
          <input
            ref={smartFindInputRef}
            value={smartFind.query}
            placeholder="Find on Greyboard..."
            onChange={(event) => updateSmartFindQuery(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                closeSmartFind();
              } else if (event.key === "Enter") {
                event.preventDefault();
                submitSmartFind();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                cycleSmartFind(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                cycleSmartFind(-1);
              }
            }}
          />
          <span className="smart-find-count">
            {smartFind.query.trim() ? `${smartFind.results.length} result${smartFind.results.length === 1 ? "" : "s"}` : "Search the board"}
          </span>
          <button type="button" aria-label="Previous result" onClick={() => cycleSmartFind(-1)}>↑</button>
          <button type="button" aria-label="Next result" onClick={() => cycleSmartFind(1)}>↓</button>
          <button type="button" aria-label="Zoom to result" onClick={submitSmartFind}>Enter</button>
          <button type="button" aria-label="Close Smart Find" onClick={closeSmartFind}>×</button>
          {activeSearchResult && (
            <button type="button" className="smart-find-active" onClick={submitSmartFind}>
              <strong>{activeSearchResult.label}</strong>
              {activeSearchResult.snippet && <span>{activeSearchResult.snippet}</span>}
            </button>
          )}
        </div>
      )}

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu">
          <div className="context-menu-title">Selection</div>
          {canGroupSelection && (
            <button type="button" role="menuitem" onClick={groupSelection}>
              <strong>Group together</strong>
              <span>Move these as one</span>
            </button>
          )}
          {canUngroupSelection && (
            <button type="button" role="menuitem" onClick={ungroupSelection}>
              <strong>Ungroup</strong>
              <span>Let the pieces move alone</span>
            </button>
          )}
        </div>
      )}

      {libraryOpen && (
        <div className="library-backdrop" role="presentation" onMouseDown={() => setLibraryOpen(false)}>
          <section className="library-panel" role="dialog" aria-modal="true" aria-label="Greyboard Library" onMouseDown={(event) => event.stopPropagation()}>
            <div className="library-header">
              <div>
                <strong>Library</strong>
                <span>{libraryBoards.length} saved Greyboard{libraryBoards.length === 1 ? "" : "s"}</span>
              </div>
              <div className="library-actions">
                <button type="button" onClick={createNewBoard}>New Board</button>
                <button type="button" aria-label="Close Library" onClick={() => setLibraryOpen(false)}>×</button>
              </div>
            </div>
            <div className="library-grid">
              {libraryBoards.map((board) => (
                <article key={board.id} className={`library-card ${board.id === libraryRef.current.activeBoardId ? "is-active" : ""}`}>
                  <button type="button" className="library-preview" onClick={() => openBoard(board.id)}>
                    {board.objects.length ? board.objects.slice(0, 3).map((object) => (
                      <span key={object.id}>{previewTextForObject(object)}</span>
                    )) : <span>Blank board</span>}
                  </button>
                  <input
                    value={board.title}
                    aria-label="Board title"
                    onChange={(event) => renameBoard(board.id, event.target.value)}
                  />
                  <small>Updated {formatBoardTime(board.updatedAt)}</small>
                  <div className="library-card-actions">
                    <button type="button" onClick={() => openBoard(board.id)}>Open</button>
                    <button type="button" onClick={() => duplicateBoard(board.id)}>Duplicate</button>
                    <button type="button" onClick={() => deleteBoard(board.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <button className="menu-button" type="button" aria-label="Toggle tools" onClick={() => setSidebarOpen((open) => !open)}>
        <span />
        <span />
        <span />
      </button>

      <div className="mobile-history" aria-label="Undo and redo">
        <button type="button" aria-label="Undo" onClick={undo}>↶</button>
        <button type="button" aria-label="Redo" onClick={redo}>↷</button>
      </div>

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
        <div className="brand">
          <strong>Greyboard</strong>
          {titleEditing ? (
            <input
              className="board-title-input"
              value={titleDraft}
              aria-label="Current board title"
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitActiveBoardTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitActiveBoardTitle();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelActiveBoardTitleEdit();
                }
              }}
            />
          ) : (
            <button type="button" className="board-title-button" onClick={() => setTitleEditing(true)}>
              {currentBoard.title}
            </button>
          )}
          <span className={`save-status save-status-${saveStatus}`}>{saveStatusLabel(saveStatus)}</span>
        </div>

        <div className="tool-list" role="toolbar" aria-label="Greyboard tools">
          {TOOL_LABELS.map((tool) => (
            <button
              key={tool.id}
              className={`sidebar-tool ${boardRef.current.currentTool === tool.id ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                if (tool.id === "clear") clearBoard();
                else if (tool.id === "settings") setSettingsOpen((open) => !open);
                else if (tool.id === "library") openLibrary();
                else if (tool.id === "find") openSmartFind();
                else setTool(tool.id);
              }}
            >
              <span className={`tool-icon tool-icon-${tool.id}`}>
                {tool.id === "pan" ? (
                  <svg className="pan-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 4v16" />
                    <path d="M4 12h16" />
                    <path d="m8 8 4-4 4 4" />
                    <path d="m8 16 4 4 4-4" />
                    <path d="m8 8-4 4 4 4" />
                    <path d="m16 8 4 4-4 4" />
                  </svg>
                ) : tool.id === "library" ? (
                  <svg className="library-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 5.5h4.25a3.25 3.25 0 0 1 3.25 3.25V19a3 3 0 0 0-3-3H5z" />
                    <path d="M19 5.5h-4.25a3.25 3.25 0 0 0-3.25 3.25V19a3 3 0 0 1 3-3H19z" />
                    <path d="M5 16V5.5" />
                    <path d="M19 16V5.5" />
                  </svg>
                ) : tool.id === "find" ? (
                  <svg className="find-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.75" cy="10.75" r="5.75" />
                    <path d="m15 15 4.25 4.25" />
                  </svg>
                ) : tool.icon}
              </span>
              <span>
                <strong>{tool.label}</strong>
              </span>
            </button>
          ))}
        </div>

        {clearConfirmOpen && (
          <div className="confirm-panel" role="dialog" aria-label="Clear board confirmation">
            <strong>Clear board?</strong>
            <span>Press Enter to confirm.</span>
            <div className="confirm-actions">
              <button type="button" onClick={confirmClearBoard}>Clear</button>
              <button type="button" onClick={() => setClearConfirmOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {settingsOpen && (
          <div className="settings-panel">
            <label>
              Theme
              <select
                value={boardRef.current.settings.themeMode}
                onChange={(event) => {
                  boardRef.current.settings.themeMode = event.target.value as ThemeMode;
                  save();
                  requestRender();
                  forceUpdate();
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={boardRef.current.settings.smartSnapEnabled}
                onChange={(event) => {
                  boardRef.current.settings.smartSnapEnabled = event.target.checked;
                  save();
                  forceUpdate();
                }}
              />
              Smart snap
            </label>
            <label>
              <input
                type="checkbox"
                checked={boardRef.current.settings.chalkTexture}
                onChange={(event) => {
                  boardRef.current.settings.chalkTexture = event.target.checked;
                  save();
                  requestRender();
                  forceUpdate();
                }}
              />
              Chalk texture
            </label>
            <label>
              Font size
              <input
                type="range"
                min="42"
                max="150"
                value={boardRef.current.settings.defaultFontSize}
                onChange={(event) => {
                  boardRef.current.settings.defaultFontSize = Number(event.target.value);
                  save();
                  forceUpdate();
                }}
              />
            </label>
            <label>
              Snap delay {boardRef.current.settings.snapDelayMs}ms
              <input
                type="range"
                min="0"
                max="1500"
                step="50"
                value={boardRef.current.settings.snapDelayMs}
                onChange={(event) => {
                  boardRef.current.settings.snapDelayMs = Number(event.target.value);
                  save();
                  forceUpdate();
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={boardRef.current.settings.angleSnapEnabled}
                onChange={(event) => {
                  boardRef.current.settings.angleSnapEnabled = event.target.checked;
                  save();
                  forceUpdate();
                }}
              />
              Angle snap
            </label>
            <label>
              Angle increment {boardRef.current.settings.angleSnapIncrementDegrees} deg
              <input
                type="range"
                min="5"
                max="90"
                step="5"
                value={boardRef.current.settings.angleSnapIncrementDegrees}
                onChange={(event) => {
                  boardRef.current.settings.angleSnapIncrementDegrees = Number(event.target.value);
                  save();
                  forceUpdate();
                }}
              />
            </label>
            <label>
              Angle threshold {boardRef.current.settings.angleSnapThresholdDegrees} deg
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={boardRef.current.settings.angleSnapThresholdDegrees}
                onChange={(event) => {
                  boardRef.current.settings.angleSnapThresholdDegrees = Number(event.target.value);
                  save();
                  forceUpdate();
                }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={boardRef.current.settings.rotationSnapEnabled}
                onChange={(event) => {
                  boardRef.current.settings.rotationSnapEnabled = event.target.checked;
                  save();
                  forceUpdate();
                }}
              />
              Rotation snap
            </label>
            <label>
              Rotate increment {boardRef.current.settings.rotationSnapIncrementDegrees} deg
              <input
                type="range"
                min="5"
                max="90"
                step="5"
                value={boardRef.current.settings.rotationSnapIncrementDegrees}
                onChange={(event) => {
                  boardRef.current.settings.rotationSnapIncrementDegrees = Number(event.target.value);
                  save();
                  forceUpdate();
                }}
              />
            </label>
          </div>
        )}

        <div className="input-guide">
          <div className="input-guide-toggle" role="tablist" aria-label="Input directions">
            {(["mouse", "touchpad"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={inputGuideMode === mode}
                className={inputGuideMode === mode ? "is-active" : ""}
                onClick={() => {
                  setInputGuideMode(mode);
                  const board = activeLibraryBoard(libraryRef.current);
                  board.inputGuideMode = mode;
                  board.updatedAt = new Date().toISOString();
                  saveLibrary(libraryRef.current);
                }}
              >
                {mode === "mouse" ? "Mouse" : "Touchpad"}
              </button>
            ))}
          </div>

          <div className="nav-hints">
            {inputGuideMode === "mouse" ? (
              <>
                <span>Click empty space = text</span>
                <span>Drag empty space = draw</span>
                <span>Right-click drag = erase</span>
                <span>Control + drag = multi-select</span>
                <span>Right-click selection = group</span>
                <span>Middle mouse drag = pan</span>
                <span>Control + scroll = zoom</span>
                <span>Shift + scroll = horizontal pan</span>
                <span>Smart Find: Control F</span>
                <span>Library: Control G</span>
                <span>Copy image / paste: Control C and Control V</span>
                <span>Undo / redo: Control Z and Control Y</span>
                <span>Double-click text to edit</span>
              </>
            ) : (
              <>
                <span>Tap empty space = text</span>
                <span>Press and drag = draw</span>
                <span>Control + drag = multi-select</span>
                <span>Right-click selection = group</span>
                <span>Two-finger drag = pan</span>
                <span>Pinch = zoom</span>
                <span>Shift + two-finger scroll = horizontal pan</span>
                <span>Smart Find: Command F or sidebar</span>
                <span>Library: Command G or sidebar</span>
                <span>Copy image / paste: Control C and Control V</span>
                <span>Undo / redo: Control Z and Control Y</span>
                <span>Double-tap text to edit</span>
              </>
            )}
          </div>
        </div>
      </aside>

      {!inboxPanel.isOpen && (
        <button
          type="button"
          className="inbox-floating-button"
          onClick={() => updateInboxPanel({ isOpen: true })}
          aria-controls="inbox-panel"
          aria-expanded={false}
        >
          <span>Inbox</span>
          <strong>{visibleTodos.length}</strong>
        </button>
      )}

      {inboxPanel.isOpen && (
        <aside
          id="inbox-panel"
          className="inbox-feed is-open"
          aria-label="Inbox Feed"
          style={{ "--inbox-panel-width": `${inboxPanel.width}px` } as React.CSSProperties}
        >
          <button
            type="button"
            className="inbox-resize-handle"
            aria-label="Resize Inbox Feed"
            onPointerDown={startInboxPanelResize}
          />
          <div className="inbox-feed-header">
            <div>
              <strong>Inbox Feed</strong>
              <span>{visibleTodos.length} pending</span>
            </div>
            <div className="inbox-feed-controls">
              <button type="button" onClick={() => void fetchInboxTodos()} disabled={inbox.loading}>
                {inbox.loading ? "Loading" : "Refresh"}
              </button>
              <button type="button" onClick={() => updateInboxPanel({ isOpen: false })}>Collapse</button>
            </div>
          </div>
          <div className="inbox-feed-meta">
            {inbox.lastUpdated ? <span>Last checked {formatBoardTime(inbox.lastUpdated)}</span> : <span>Not checked yet</span>}
            {inbox.accounts.length > 0 && (
              <button type="button" className="inbox-account-pill" onClick={() => setAccountLegendOpen((open) => !open)} aria-expanded={accountLegendOpen}>
                {inbox.accounts.length} account{inbox.accounts.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
          {accountLegendOpen && inbox.accounts.length > 0 && (
            <div className="inbox-account-legend">
              {inbox.accounts.map((account) => (
                <div key={account.id} className="inbox-account-row">
                  <AccountIcon account={account} size="large" />
                  <span>{account.email || account.label}</span>
                </div>
              ))}
            </div>
          )}
          {inbox.loading && (
            <div className="inbox-state">
              <strong>Checking inbox...</strong>
              <span>Looking for personal emails that need time or a reply.</span>
            </div>
          )}
          {!inbox.loading && inbox.errorCode === "config_missing" && (
            <div className="inbox-state">
              <strong>Gmail not connected yet.</strong>
              <span>Add Google OAuth env vars in Vercel to enable real inbox todos.</span>
              <button type="button" onClick={() => setSetupNotesOpen((open) => !open)}>Setup notes</button>
              {setupNotesOpen && (
                <div className="setup-notes">
                  <span>Required env vars:</span>
                  <code>GOOGLE_CLIENT_ID</code>
                  <code>GOOGLE_CLIENT_SECRET</code>
                  <code>GMAIL_ACCOUNT_1_EMAIL</code>
                  <code>GMAIL_ACCOUNT_1_REFRESH_TOKEN</code>
                  <code>GMAIL_ACCOUNT_2_EMAIL</code>
                  <code>GMAIL_ACCOUNT_2_REFRESH_TOKEN</code>
                  <small>No passwords. No frontend secrets.</small>
                </div>
              )}
            </div>
          )}
          {!inbox.loading && inbox.errorCode === "error" && (
            <div className="inbox-state">
              <strong>Could not load inbox todos.</strong>
              <span>Greyboard is still available.</span>
              <button type="button" onClick={() => void fetchInboxTodos()}>Retry</button>
            </div>
          )}
          {!inbox.loading && !inbox.error && visibleTodos.length === 0 && (
            <div className="inbox-state">
              <strong>No email todos right now.</strong>
              <span>Nothing personal-looking needs attention.</span>
            </div>
          )}
          {!inbox.loading && !inbox.error && visibleTodos.map((todo) => {
            const preview = inboxPreview.openTodoId === todo.id ? inboxPreview.byTodoId[todo.id] : null;
            const previewError = inboxPreview.errorByTodoId[todo.id];
            const isExpanded = expandedInboxId === todo.id;
            return (
              <article
                key={todo.id}
                className={`inbox-item urgency-${todo.urgency} ${isExpanded ? "is-expanded" : ""}`}
                onWheel={(event) => handleInboxItemWheel(event, todo)}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  hideInboxTodoWithUndo(todo);
                }}
                onMouseDown={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                }}
              >
                <button
                  type="button"
                  className="inbox-item-main"
                  onClick={() => setExpandedInboxId(isExpanded ? null : todo.id)}
                  aria-expanded={isExpanded}
                >
                  <b>{urgencyLabel(todo.urgency)}</b>
                  <span>{todo.title}</span>
                  {todo.dueDate && <em>{todo.dueDate}</em>}
                </button>
                <small className="inbox-item-source">
                  <AccountIcon account={accountForTodo(todo, inbox.accounts)} />
                  <span>{todo.subject || todo.contactName || todo.accountLabel || "Gmail"}</span>
                </small>
                {isExpanded && (
                  <div className="inbox-item-expanded">
                    <span><strong>Next:</strong> {todo.suggestedAction}</span>
                    {todo.suggestedDraft && <span><strong>Draft:</strong> {todo.suggestedDraft}</span>}
                    <span className="inbox-context-line"><strong>Context:</strong> {todo.reason}</span>
                    <div className="inbox-item-actions">
                      <button type="button" onClick={() => addInboxTodoToBoard(todo)}>Add to board</button>
                      <button type="button" onClick={() => void fetchInboxEmailPreview(todo)}>
                        {inboxPreview.loadingTodoId === todo.id ? "Loading" : preview ? "Hide email" : "Preview email"}
                      </button>
                      {todo.suggestedDraft && <button type="button" onClick={() => void copyInboxDraft(todo)}>Copy draft</button>}
                      {todo.gmailUrl && <button type="button" onClick={() => window.open(todo.gmailUrl, "_blank", "noopener,noreferrer")}>Open Gmail</button>}
                      <button type="button" onClick={() => setTodoStatus(todo.id, "done")}>Done</button>
                      <button type="button" onClick={() => hideInboxTodoWithUndo(todo)}>Hide</button>
                    </div>
                    {previewError && <span className="inbox-email-preview-error">{previewError}</span>}
                    {preview && (
                      <div className="inbox-email-preview">
                        <div className="inbox-email-preview-header">
                          <strong>{preview.subject || todo.subject || "Email"}</strong>
                          {preview.date && <span>{formatBoardTime(preview.date)}</span>}
                        </div>
                        {preview.from && <span className="inbox-email-preview-meta">From: {preview.from}</span>}
                        <pre className="inbox-email-preview-body">{preview.bodyText || preview.snippet || "No preview text."}</pre>
                        {preview.bodyTruncated && <span className="inbox-email-preview-meta">Preview truncated.</span>}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </aside>
      )}
    </main>
  );
}

function AccountIcon({ account, size = "small" }: { account?: Partial<InboxAccount>; size?: "small" | "large" }) {
  const icon = account?.icon || account?.label?.slice(0, 1) || "G";
  const label = account?.email || account?.label || "Gmail";
  const imageSrc = accountIconImage(icon, account?.email);
  return (
    <span
      className={`account-icon account-icon-${size}`}
      title={label}
      aria-label={label}
      style={{ "--account-color": account?.color || "#5f6fcb" } as React.CSSProperties}
    >
      {imageSrc ? <img src={imageSrc} alt="" /> : icon.slice(0, 2).toUpperCase()}
    </span>
  );
}

function renderObject(ctx: CanvasRenderingContext2D, object: BoardObject, settings: Settings) {
  if (object.type === "text") {
    renderText(ctx, object, settings);
  } else if (object.type === "stroke") {
    renderWithObjectRotation(ctx, object, () => {
      renderStrokePath(ctx, object.points, object.size, resolveInk(object.color, settings), object.opacity, settings.chalkTexture, object.id);
    });
  } else {
    renderWithObjectRotation(ctx, object, () => renderShape(ctx, object, settings));
  }
}

function renderText(ctx: CanvasRenderingContext2D, object: TextObject, settings: Settings) {
  if (!object.text.trim()) return;
  ctx.save();
  ctx.translate(object.x, object.y);
  ctx.rotate(object.rotation);
  ctx.globalAlpha = object.opacity;
  const ink = resolveInk(object.color, settings);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = object.opacity * 0.42;
  ctx.lineWidth = Math.max(1.4, object.fontSize * 0.035);
  ctx.lineJoin = "round";
  ctx.strokeRect(0, 0, object.width, object.height);
  ctx.globalAlpha = object.opacity;
  ctx.fillStyle = ink;
  ctx.shadowColor = settings.themeMode === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.24)";
  ctx.shadowBlur = settings.chalkTexture ? 5 : 0;
  ctx.font = `${object.fontSize}px ${TEXT_FONT_FAMILY}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const padding = textBoxPadding(object.fontSize);
  const lines = wrapText(ctx, object.text, object.width - padding.left - padding.right, object.fontSize);
  const lineHeightFactor = object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT;
  const lineHeight = object.fontSize * lineHeightFactor;
  const visualTopOffset = getTextVisualTopOffset(ctx, object.fontSize, lineHeightFactor);
  lines.forEach((line, index) => {
    const y = visualTopOffset + index * lineHeight;
    renderHighlightedTextLine(ctx, line, padding.left, y + padding.top, ink);
    if (settings.chalkTexture) {
      ctx.globalAlpha = object.opacity * 0.13;
      renderHighlightedTextLine(ctx, line, padding.left + seededNoise(object.id, index) * 1.4, padding.top + y + seededNoise(object.id, index + 99) * 1.2, ink);
      ctx.globalAlpha = object.opacity;
    }
  });
  ctx.restore();
}

function renderHighlightedTextLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, ink: string) {
  const parts = splitScheduleHighlights(line);
  let cursor = x;
  for (const part of parts) {
    ctx.fillStyle = part.highlight ? SCHEDULE_HIGHLIGHT : ink;
    ctx.fillText(part.text, cursor, y);
    cursor += ctx.measureText(part.text).width;
  }
}

function splitScheduleHighlights(line: string) {
  const pattern = /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|noon|midnight|\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\s?(?:am|pm)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi;
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: line.slice(last, index), highlight: false });
    parts.push({ text: match[0], highlight: true });
    last = index + match[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), highlight: false });
  return parts.length ? parts : [{ text: line, highlight: false }];
}

function getTextVisualTopOffset(ctx: CanvasRenderingContext2D, fontSize: number, lineHeight: number) {
  const metrics = ctx.measureText("Mg");
  const fontOverhang = Math.max((metrics.fontBoundingBoxAscent || fontSize) - fontSize, 0);
  const halfLeading = Math.max(fontSize * lineHeight - fontSize, 0) / 2;
  return fontOverhang / 2 + halfLeading;
}

function renderStrokePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  size: number,
  color: string,
  opacity: number,
  chalk: boolean,
  seed: string,
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = size;
  drawPath(ctx, points, 0, seed);
  ctx.stroke();
  if (chalk) {
    ctx.globalAlpha = opacity * 0.22;
    ctx.lineWidth = size * 0.55;
    drawPath(ctx, points, 1.7, `${seed}:a`);
    ctx.stroke();
    ctx.globalAlpha = opacity * 0.18;
    ctx.lineWidth = size * 1.28;
    drawPath(ctx, points, 1.1, `${seed}:b`);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, points: Point[], jitter: number, seed: string) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const jx = jitter ? seededNoise(seed, index * 2) * jitter : 0;
    const jy = jitter ? seededNoise(seed, index * 2 + 1) * jitter : 0;
    if (index === 0) ctx.moveTo(point.x + jx, point.y + jy);
    else ctx.lineTo(point.x + jx, point.y + jy);
  });
}

function renderShape(ctx: CanvasRenderingContext2D, object: ShapeObject, settings: Settings) {
  const points = shapeToStrokePoints(object);
  renderStrokePath(ctx, points, object.size, resolveInk(object.color, settings), object.opacity, settings.chalkTexture, object.id);
}

function shapeToStrokePoints(object: ShapeObject): Point[] {
  const geometry = object.geometry;
  if ("start" in geometry && "end" in geometry) {
    const base = [geometry.start, geometry.end];
    if (object.shapeType !== "arrow") return base;
    const angle = Math.atan2(geometry.end.y - geometry.start.y, geometry.end.x - geometry.start.x);
    const len = Math.min(42, distance(geometry.start, geometry.end) * 0.25);
    const left = { x: geometry.end.x - Math.cos(angle - Math.PI / 6) * len, y: geometry.end.y - Math.sin(angle - Math.PI / 6) * len };
    const right = { x: geometry.end.x - Math.cos(angle + Math.PI / 6) * len, y: geometry.end.y - Math.sin(angle + Math.PI / 6) * len };
    return [geometry.start, geometry.end, left, geometry.end, right];
  }

  if ("center" in geometry) {
    const points: Point[] = [];
    for (let i = 0; i <= 80; i += 1) {
      const a = (i / 80) * Math.PI * 2;
      points.push({ x: geometry.center.x + Math.cos(a) * geometry.rx, y: geometry.center.y + Math.sin(a) * geometry.ry });
    }
    return points;
  }

  if (object.shapeType === "curve") return geometry.points;
  return [...geometry.points, geometry.points[0]];
}

function renderSelection(ctx: CanvasRenderingContext2D, object: BoardObject, settings: Settings, quiet = false) {
  const box = objectBounds(object);
  const handles = quiet ? [] : selectionHandles(object);
  const origin = objectRotationOrigin(object);
  const rotation = object.rotation ?? 0;
  const scale = currentScale(ctx);
  ctx.save();
  ctx.strokeStyle = currentTheme(settings).handle;
  ctx.lineWidth = 1.2 / scale;
  if (object.type !== "text") ctx.setLineDash([7 / scale, 6 / scale]);

  if (object.type === "text") {
    ctx.translate(object.x, object.y);
    ctx.rotate(object.rotation ?? 0);
    ctx.strokeRect(0, 0, object.width, object.height);
    ctx.setLineDash([]);
    ctx.fillStyle = currentTheme(settings).background;
    ctx.strokeStyle = currentTheme(settings).handle;
    for (const handle of handles) {
      const local = worldToLocalText(handle.point, object);
      if (handle.name === "rotate") {
        ctx.beginPath();
        ctx.arc(local.x, local.y, 7 / scale, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.roundRect(local.x - 5 / scale, local.y - 5 / scale, 10 / scale, 10 / scale, 1.5 / scale);
        ctx.fill();
        ctx.stroke();
      }
    }
  } else {
    ctx.translate(origin.x, origin.y);
    ctx.rotate(rotation);
    ctx.translate(-origin.x, -origin.y);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);
    ctx.fillStyle = currentTheme(settings).background;
    ctx.strokeStyle = currentTheme(settings).handle;
    for (const handle of handles) {
      const local = inverseRotatePoint(handle.point, origin, rotation);
      if (handle.name === "rotate") {
        ctx.beginPath();
        ctx.arc(local.x, local.y, 7 / scale, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillRect(local.x - 4 / scale, local.y - 4 / scale, 8 / scale, 8 / scale);
        ctx.strokeRect(local.x - 4 / scale, local.y - 4 / scale, 8 / scale, 8 / scale);
      }
    }
    if (object.origin?.mode === "start") {
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 4.5 / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderSearchHighlights(ctx: CanvasRenderingContext2D, results: SearchResult[], activeIndex: number, settings: Settings, viewport: Viewport) {
  const scale = currentScale(ctx);
  const theme = currentTheme(settings);
  const clusters = buildSearchClusters(results);
  ctx.save();
  for (const cluster of clusters) {
    ctx.save();
    ctx.strokeStyle = settings.themeMode === "dark" ? "rgba(138, 181, 255, 0.42)" : "rgba(55, 79, 120, 0.32)";
    ctx.fillStyle = settings.themeMode === "dark" ? "rgba(138, 181, 255, 0.055)" : "rgba(55, 79, 120, 0.045)";
    ctx.lineWidth = 3 / scale;
    ctx.setLineDash([18 / scale, 14 / scale]);
    const rounded = expandRect(cluster, 36);
    ctx.beginPath();
    ctx.roundRect(rounded.x, rounded.y, rounded.width, rounded.height, 28 / scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  results.forEach((result, index) => {
    const active = index === activeIndex;
    const rect = expandRect(result.bounds, active ? 26 : 16);
    ctx.save();
    ctx.shadowColor = settings.themeMode === "dark" ? "rgba(176, 204, 255, 0.55)" : "rgba(46, 69, 110, 0.32)";
    ctx.shadowBlur = active ? 26 / scale : 14 / scale;
    ctx.strokeStyle = active ? theme.ink : (settings.themeMode === "dark" ? "rgba(180, 205, 255, 0.62)" : "rgba(40, 55, 85, 0.48)");
    ctx.fillStyle = settings.themeMode === "dark" ? "rgba(180, 205, 255, 0.06)" : "rgba(40, 55, 85, 0.045)";
    ctx.lineWidth = active ? 3 / scale : 1.6 / scale;
    ctx.setLineDash(active ? [] : [9 / scale, 7 / scale]);
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 14 / scale);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const labelPoint = worldToScreen({ x: rect.x, y: rect.y }, viewport);
    if (labelPoint.x > -120 && labelPoint.x < window.innerWidth + 120 && labelPoint.y > -60 && labelPoint.y < window.innerHeight + 60) {
      ctx.save();
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      ctx.font = `${active ? 13 : 11}px Inter, Segoe UI, sans-serif`;
      const label = active ? result.label : result.label.slice(0, 28);
      const width = ctx.measureText(label).width + 16;
      ctx.fillStyle = theme.panelBg;
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(labelPoint.x, labelPoint.y - 26, width, 22, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = theme.ink;
      ctx.fillText(label, labelPoint.x + 8, labelPoint.y - 11);
      ctx.restore();
    }
  });
  ctx.restore();
}

function renderSelectBox(ctx: CanvasRenderingContext2D, start: Point, current: Point, settings: Settings) {
  const rect = normalizeRect(start, current);
  const scale = currentScale(ctx);
  const theme = currentTheme(settings);
  ctx.save();
  ctx.fillStyle = theme.selection;
  ctx.strokeStyle = theme.handle;
  ctx.lineWidth = 1.2 / scale;
  ctx.setLineDash([6 / scale, 5 / scale]);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function renderObjectsToPng(objects: BoardObject[], settings: Settings) {
  if (!objects.length) return null;
  const bounds = objects.reduce((rect, object) => unionRects(rect, objectBounds(object)), objectBounds(objects[0]));
  const padding = 28;
  const width = Math.ceil(Math.max(bounds.width + padding * 2, 1));
  const height = Math.ceil(Math.max(bounds.height + padding * 2, 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = currentTheme(settings).background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(padding - bounds.x, padding - bounds.y);
  for (const object of objects) renderObject(ctx, object, settings);
  ctx.restore();
  const dataUrl = canvas.toDataURL("image/png");
  return { blob: dataUrlToBlob(dataUrl), dataUrl };
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, data] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extractGreyboardPayloadFromHtml(html: string) {
  const match = html.match(/greyboard-data:([A-Za-z0-9+/=]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(escape(window.atob(match[1])));
  } catch {
    return "";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function renderEraserCursor(ctx: CanvasRenderingContext2D, point: Point, radius: number) {
  const theme = currentTheme(boardRefSafe().settings);
  ctx.save();
  ctx.strokeStyle = theme.handle;
  ctx.fillStyle = theme.selection;
  ctx.lineWidth = 1.2 / currentScale(ctx);
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function currentScale(ctx: CanvasRenderingContext2D) {
  return ctx.getTransform().a || 1;
}

function makeStroke(points: Point[]): StrokeObject {
  return {
    id: createId(),
    type: "stroke",
    points,
    size: 7,
    bbox: pointsBounds(points),
    rotation: 0,
    origin: centerOrigin(pointsBounds(points)),
    rawStartPoint: points[0],
    rawEndPoint: points[points.length - 1],
    rawPoints: points,
    color: DEFAULT_INK,
    opacity: 0.92,
    createdAt: Date.now(),
  };
}

function makeShape(shapeType: ShapeKind, geometry: ShapeGeometry, sourcePoints?: Point[]): ShapeObject {
  const sourceStartPoint = sourcePoints?.[0];
  const sourceEndPoint = sourcePoints?.[sourcePoints.length - 1];
  const bbox = shapeBounds(shapeType, geometry);
  const startAnchored = shapeType === "line" || shapeType === "arrow" || shapeType === "curve";
  return {
    id: createId(),
    type: "shape",
    shapeType,
    geometry,
    size: 7,
    bbox,
    rotation: 0,
    origin: startAnchored && sourceStartPoint ? { ...sourceStartPoint, mode: "start" } : centerOrigin(bbox),
    sourceStartPoint,
    sourceEndPoint,
    rawPoints: sourcePoints,
    color: DEFAULT_INK,
    opacity: 0.92,
    createdAt: Date.now(),
  };
}

function recognizeShape(points: Point[], settings: Settings, forceAngleSnap = false): ShapeObject | null {
  const bounds = pointsBounds(points);
  const length = pathLength(points);
  const start = points[0];
  const end = points[points.length - 1];
  const closed = distance(start, end) < Math.max(24, Math.min(bounds.width, bounds.height) * 0.32);
  const straightRatio = distance(start, end) / Math.max(length, 1);
  const lineError = maxLineDeviation(points, start, end);
  const arrow = detectArrowGeometry(points);

  if (arrow) {
    const snapped = maybeSnapLineAngle(arrow.start, arrow.end, settings, forceAngleSnap);
    arrow.end = snapped;
    return makeShape("arrow", arrow, points);
  }

  if (!closed && straightRatio > 0.78 && lineError < Math.max(10, length * 0.055)) {
    return makeShape("line", { start, end: maybeSnapLineAngle(start, end, settings, forceAngleSnap) }, points);
  }

  const simplified = simplifyRdp(points, Math.max(10, Math.min(bounds.width, bounds.height) * 0.08));
  const polygon = removeNearDuplicateClosed(simplified);

  if (closed && polygon.length >= 3) {
    if (polygon.length <= 6 && rightAngleScore(polygon) > 0.52) {
      return makeShape("rect", { points: rectPoints(bounds) }, points);
    }

    if (polygon.length <= 4) {
      return makeShape("triangle", { points: bestTriangle(polygon, bounds) }, points);
    }

    if (isEllipseLike(points, bounds, length)) {
      return makeShape("ellipse", {
        center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        rx: Math.max(bounds.width / 2, 4),
        ry: Math.max(bounds.height / 2, 4),
      }, points);
    }
  }

  if (closed && isEllipseLike(points, bounds, length)) {
    return makeShape("ellipse", {
      center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      rx: Math.max(bounds.width / 2, 4),
      ry: Math.max(bounds.height / 2, 4),
    }, points);
  }

  const curve = recognizeCurve(points, bounds, length);
  if (curve) return curve;

  return null;
}

function detectArrowGeometry(points: Point[]): { start: Point; end: Point } | null {
  if (points.length < 8) return null;
  const start = points[0];
  let tipIndex = 0;
  let tipDistance = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = distance(start, points[i]);
    if (d > tipDistance) {
      tipDistance = d;
      tipIndex = i;
    }
  }
  if (tipIndex < points.length * 0.45 || tipDistance < 48) return null;

  const end = points[tipIndex];
  const body = points.slice(0, tipIndex + 1);
  const bodyAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const bodyError = maxLineDeviation(body, start, end);
  if (bodyError > Math.max(16, tipDistance * 0.12)) return null;

  const head = points.slice(tipIndex + 1);
  const offAxis = head.filter((point) => {
    const angle = Math.atan2(end.y - point.y, end.x - point.x);
    const diff = Math.abs(angleDelta(angle, bodyAngle));
    const d = distance(point, end);
    return d > 10 && d < 80 && diff > 0.35 && diff < 1.35;
  });
  return offAxis.length >= 2 ? { start, end } : null;
}

function maybeSnapLineAngle(start: Point, end: Point, settings: Settings, force: boolean) {
  if (!force && !settings.angleSnapEnabled) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return end;
  const increment = degreesToRadians(Math.max(1, settings.angleSnapIncrementDegrees));
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / increment) * increment;
  const delta = Math.abs(angleDelta(angle, snappedAngle));
  const threshold = degreesToRadians(force ? 180 : settings.angleSnapThresholdDegrees);
  if (delta > threshold) return end;
  return {
    x: start.x + Math.cos(snappedAngle) * length,
    y: start.y + Math.sin(snappedAngle) * length,
  };
}

function recognizeCurve(points: Point[], bounds: Rect, length: number) {
  if (points.length < 8) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const direct = distance(start, end);
  if (direct < 30 || direct / Math.max(length, 1) > 0.86) return null;
  if (bounds.width < 20 && bounds.height < 20) return null;

  const mid = points[Math.floor(points.length / 2)];
  const control = quadraticControlFromMid(start, mid, end);
  const fitted = sampleQuadratic(start, control, end, 36);
  const error = averageCurveError(points, fitted);
  const tolerance = Math.max(10, Math.min(bounds.width + bounds.height, 500) * 0.055);
  if (error > tolerance) return null;
  return makeShape("curve", { points: fitted }, points);
}

function isEllipseLike(points: Point[], bounds: Rect, length: number) {
  if (bounds.width < 18 || bounds.height < 18) return false;
  const circumferenceApprox = Math.PI * Math.sqrt(2 * ((bounds.width / 2) ** 2 + (bounds.height / 2) ** 2));
  const ratio = length / Math.max(circumferenceApprox, 1);
  return ratio > 0.62 && ratio < 1.85;
}

function rightAngleScore(points: Point[]) {
  let score = 0;
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const a = Math.atan2(prev.y - current.y, prev.x - current.x);
    const b = Math.atan2(next.y - current.y, next.x - current.x);
    const angle = Math.abs(angleDelta(a, b));
    score += 1 - Math.min(Math.abs(angle - Math.PI / 2) / (Math.PI / 2), 1);
    count += 1;
  }
  return count ? score / count : 0;
}

function bestTriangle(points: Point[], bounds: Rect) {
  if (points.length === 3) return points;
  return [
    { x: bounds.x + bounds.width / 2, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function rectPoints(bounds: Rect) {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function hitTest(point: Point) {
  const objects = boardRefSafe().objects;
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    if (object.type === "text") {
      const local = worldToLocalText(point, object);
      if (local.x >= 0 && local.y >= 0 && local.x <= object.width && local.y <= object.height) return object;
    } else if (hitObjectStroke(object, point, HIT_TOLERANCE / boardRefSafe().viewport.scale)) {
      return object;
    }
  }
  return null;
}

function hitObjectStroke(object: BoardObject, point: Point, tolerance: number) {
  if (object.type === "text") {
    const local = worldToLocalText(point, object);
    return local.x >= -tolerance && local.y >= -tolerance && local.x <= object.width + tolerance && local.y <= object.height + tolerance;
  }

  const localPoint = inverseRotatePoint(point, objectRotationOrigin(object), object.rotation ?? 0);
  const points = object.type === "stroke" ? object.points : shapeToStrokePoints(object);
  for (let i = 1; i < points.length; i += 1) {
    if (pointToSegmentDistance(localPoint, points[i - 1], points[i]) <= tolerance + ("size" in object ? object.size / 2 : 4)) return true;
  }
  return false;
}

function hitSelectionHandle(point: Point) {
  const state = boardRefSafe();
  const selected = state.objects.find((object) => object.id === state.selectedIds[0]);
  if (!selected) return null;
  const tolerance = 18 / state.viewport.scale;
  for (const handle of selectionHandles(selected)) {
    if (distance(point, handle.point) <= tolerance) return handle.name;
  }
  return null;
}

function selectionHandles(object: BoardObject) {
  if (object.type !== "text") {
    const box = objectBounds(object);
    const origin = objectRotationOrigin(object);
    const rotation = object.rotation ?? 0;
    return [
      { name: "nw", point: rotatePoint({ x: box.x, y: box.y }, origin, rotation) },
      { name: "ne", point: rotatePoint({ x: box.x + box.width, y: box.y }, origin, rotation) },
      { name: "se", point: rotatePoint({ x: box.x + box.width, y: box.y + box.height }, origin, rotation) },
      { name: "sw", point: rotatePoint({ x: box.x, y: box.y + box.height }, origin, rotation) },
      { name: "rotate", point: rotatePoint({ x: box.x + box.width / 2, y: box.y - Math.max(38, Math.min(70, box.height * 0.6)) }, origin, rotation) },
    ];
  }
  const corners = [
    { name: "nw", point: localToWorldText({ x: 0, y: 0 }, object) },
    { name: "n", point: localToWorldText({ x: object.width / 2, y: 0 }, object) },
    { name: "ne", point: localToWorldText({ x: object.width, y: 0 }, object) },
    { name: "e", point: localToWorldText({ x: object.width, y: object.height / 2 }, object) },
    { name: "se", point: localToWorldText({ x: object.width, y: object.height }, object) },
    { name: "s", point: localToWorldText({ x: object.width / 2, y: object.height }, object) },
    { name: "sw", point: localToWorldText({ x: 0, y: object.height }, object) },
    { name: "w", point: localToWorldText({ x: 0, y: object.height / 2 }, object) },
    { name: "rotate", point: localToWorldText({ x: object.width / 2, y: -42 }, object) },
  ];
  return corners;
}

function cursorForHandle(handle: string) {
  const cursors: Record<string, string> = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    w: "ew-resize",
    e: "ew-resize",
    rotate: "grab",
  };
  return cursors[handle] ?? "default";
}

function applyMove(object: BoardObject, original: BoardObject, dx: number, dy: number) {
  if (object.type === "text" && original.type === "text") {
    object.x = original.x + dx;
    object.y = original.y + dy;
    if (original.origin) object.origin = { ...original.origin, x: original.origin.x + dx, y: original.origin.y + dy };
    object.updatedAt = Date.now();
  } else if (object.type === "stroke" && original.type === "stroke") {
    object.points = original.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }));
    object.bbox = pointsBounds(object.points);
    object.origin = moveOrigin(original.origin ?? centerOrigin(original.bbox), dx, dy);
    object.rawStartPoint = original.rawStartPoint ? movePoint(original.rawStartPoint, dx, dy) : undefined;
    object.rawEndPoint = original.rawEndPoint ? movePoint(original.rawEndPoint, dx, dy) : undefined;
    object.rawPoints = original.rawPoints?.map((point) => movePoint(point, dx, dy));
  } else if (object.type === "shape" && original.type === "shape") {
    object.geometry = moveGeometry(original.geometry, dx, dy);
    object.bbox = shapeBounds(object.shapeType, object.geometry);
    object.origin = moveOrigin(original.origin ?? centerOrigin(original.bbox), dx, dy);
    object.sourceStartPoint = original.sourceStartPoint ? movePoint(original.sourceStartPoint, dx, dy) : undefined;
    object.sourceEndPoint = original.sourceEndPoint ? movePoint(original.sourceEndPoint, dx, dy) : undefined;
    object.rawStartPoint = original.rawStartPoint ? movePoint(original.rawStartPoint, dx, dy) : undefined;
    object.rawEndPoint = original.rawEndPoint ? movePoint(original.rawEndPoint, dx, dy) : undefined;
    object.rawPoints = original.rawPoints?.map((point) => movePoint(point, dx, dy));
  }
}

function applyResize(object: BoardObject, original: BoardObject, handle: string, dx: number, dy: number) {
  if (object.type === "text" && original.type === "text") {
    const constraints = textBoxConstraints(original);
    if (handle.includes("e")) object.width = Math.max(constraints.minWidth, original.width + dx);
    if (handle.includes("s")) object.height = Math.max(textBoxConstraints(object, object.width).minHeight, original.height + dy);
    if (handle.includes("w")) {
      const width = Math.max(constraints.minWidth, original.width - dx);
      object.x = original.x + (original.width - width);
      object.width = width;
    }
    if (handle.includes("n")) {
      const height = Math.max(textBoxConstraints(object, object.width).minHeight, original.height - dy);
      object.y = original.y + (original.height - height);
      object.height = height;
    }
    const finalConstraints = textBoxConstraints(object, object.width);
    object.width = Math.max(object.width, finalConstraints.minWidth);
    object.height = Math.max(object.height, finalConstraints.minHeight);
    object.updatedAt = Date.now();
  } else if (object.type === "stroke" && original.type === "stroke") {
    const transform = resizeTransform(original.bbox, handle, dx, dy, 8);
    object.points = original.points.map((point) => transformPointInRect(point, original.bbox, transform.next));
    object.bbox = pointsBounds(object.points);
    object.origin = original.origin ? transformOriginInRect(original.origin, original.bbox, transform.next) : centerOrigin(object.bbox);
    object.rawStartPoint = original.rawStartPoint ? transformPointInRect(original.rawStartPoint, original.bbox, transform.next) : undefined;
    object.rawEndPoint = original.rawEndPoint ? transformPointInRect(original.rawEndPoint, original.bbox, transform.next) : undefined;
    object.rawPoints = original.rawPoints?.map((point) => transformPointInRect(point, original.bbox, transform.next));
    object.updatedAt = Date.now();
  } else if (object.type === "shape" && original.type === "shape") {
    const transform = resizeTransform(original.bbox, handle, dx, dy, 8);
    object.geometry = resizeGeometry(original.geometry, original.bbox, transform.next);
    object.bbox = shapeBounds(object.shapeType, object.geometry);
    object.origin = original.origin ? transformOriginInRect(original.origin, original.bbox, transform.next) : centerOrigin(object.bbox);
    object.sourceStartPoint = original.sourceStartPoint ? transformPointInRect(original.sourceStartPoint, original.bbox, transform.next) : undefined;
    object.sourceEndPoint = original.sourceEndPoint ? transformPointInRect(original.sourceEndPoint, original.bbox, transform.next) : undefined;
    object.rawStartPoint = original.rawStartPoint ? transformPointInRect(original.rawStartPoint, original.bbox, transform.next) : undefined;
    object.rawEndPoint = original.rawEndPoint ? transformPointInRect(original.rawEndPoint, original.bbox, transform.next) : undefined;
    object.rawPoints = original.rawPoints?.map((point) => transformPointInRect(point, original.bbox, transform.next));
    object.updatedAt = Date.now();
  }
}

function resizeTransform(rect: Rect, handle: string, dx: number, dy: number, minSize: number) {
  let x = rect.x;
  let y = rect.y;
  let width = rect.width;
  let height = rect.height;
  if (handle.includes("e")) width = Math.max(minSize, rect.width + dx);
  if (handle.includes("s")) height = Math.max(minSize, rect.height + dy);
  if (handle.includes("w")) {
    width = Math.max(minSize, rect.width - dx);
    x = rect.x + (rect.width - width);
  }
  if (handle.includes("n")) {
    height = Math.max(minSize, rect.height - dy);
    y = rect.y + (rect.height - height);
  }
  return { next: { x, y, width, height } };
}

function transformPointInRect(point: Point, from: Rect, to: Rect): Point {
  const nx = from.width ? (point.x - from.x) / from.width : 0.5;
  const ny = from.height ? (point.y - from.y) / from.height : 0.5;
  return { ...point, x: to.x + nx * to.width, y: to.y + ny * to.height };
}

function transformOriginInRect(origin: RotationOrigin, from: Rect, to: Rect): RotationOrigin {
  const point = transformPointInRect(origin, from, to);
  return { ...origin, x: point.x, y: point.y };
}

function resizeGeometry(geometry: ShapeGeometry, from: Rect, to: Rect): ShapeGeometry {
  if ("start" in geometry && "end" in geometry) {
    return {
      start: transformPointInRect(geometry.start, from, to),
      end: transformPointInRect(geometry.end, from, to),
    };
  }
  if ("center" in geometry) {
    const center = transformPointInRect(geometry.center, from, to);
    const sx = to.width / Math.max(from.width, 1);
    const sy = to.height / Math.max(from.height, 1);
    return { center, rx: Math.max(geometry.rx * sx, 4), ry: Math.max(geometry.ry * sy, 4) };
  }
  return { points: geometry.points.map((point) => transformPointInRect(point, from, to)) };
}

function moveGeometry(geometry: ShapeGeometry, dx: number, dy: number): ShapeGeometry {
  if ("start" in geometry && "end" in geometry) {
    return {
      start: { x: geometry.start.x + dx, y: geometry.start.y + dy },
      end: { x: geometry.end.x + dx, y: geometry.end.y + dy },
    };
  }
  if ("center" in geometry) {
    return { ...geometry, center: { x: geometry.center.x + dx, y: geometry.center.y + dy } };
  }
  return { points: geometry.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
}

function objectCenter(object: BoardObject): Point {
  if (object.type === "text") return localToWorldText({ x: object.width / 2, y: object.height / 2 }, object);
  const box = objectBounds(object);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function objectBounds(object: BoardObject): Rect {
  if (object.type === "text") {
    const corners = [
      localToWorldText({ x: 0, y: 0 }, object),
      localToWorldText({ x: object.width, y: 0 }, object),
      localToWorldText({ x: object.width, y: object.height }, object),
      localToWorldText({ x: 0, y: object.height }, object),
    ];
    return pointsBounds(corners);
  }
  return object.bbox;
}

function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function rectsIntersect(a: Rect, b: Rect) {
  return a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y;
}

function unionRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: maxX - x, height: maxY - y };
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function shapeBounds(shapeType: ShapeKind, geometry: ShapeGeometry): Rect {
  if ("start" in geometry && "end" in geometry) return pointsBounds([geometry.start, geometry.end]);
  if ("center" in geometry) return { x: geometry.center.x - geometry.rx, y: geometry.center.y - geometry.ry, width: geometry.rx * 2, height: geometry.ry * 2 };
  return pointsBounds(shapeType === "triangle" || shapeType === "rect" ? geometry.points : [...geometry.points]);
}

function makeEditorStyle(object: TextObject, viewport: Viewport): React.CSSProperties {
  const screen = worldToScreen({ x: object.x, y: object.y }, viewport);
  const scaledFontSize = object.fontSize * viewport.scale;
  const scaledLineHeight = object.fontSize * (object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT) * viewport.scale;
  const padding = textBoxPadding(object.fontSize);
  return {
    left: `${screen.x}px`,
    top: `${screen.y}px`,
    width: `${object.width * viewport.scale}px`,
    height: `${Math.max(object.height, textBoxConstraints(object).minHeight) * viewport.scale}px`,
    fontSize: `${scaledFontSize}px`,
    lineHeight: `${scaledLineHeight}px`,
    padding: `${padding.top * viewport.scale}px ${padding.right * viewport.scale}px ${padding.bottom * viewport.scale}px ${padding.left * viewport.scale}px`,
    fontFamily: TEXT_FONT_FAMILY,
    transform: `rotate(${object.rotation ?? 0}rad)`,
    transformOrigin: "0 0",
  };
}

function measureTextBox(object: TextObject) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: object.width, height: object.height, minWidth: TEXT_BOX_MIN_WIDTH, minHeight: TEXT_BOX_MIN_HEIGHT };
  ctx.font = `${object.fontSize}px ${TEXT_FONT_FAMILY}`;
  const padding = textBoxPadding(object.fontSize);
  const contentWidth = object.width - padding.left - padding.right;
  const lines = wrapText(ctx, object.text || " ", contentWidth, object.fontSize);
  const lineHeightFactor = object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT;
  const lineHeight = object.fontSize * lineHeightFactor;
  const visualTopOffset = getTextVisualTopOffset(ctx, object.fontSize, lineHeightFactor);
  const lineInkHeight = measuredLineInkHeight(ctx, object.fontSize);
  const height = visualTopOffset + Math.max(lines.length - 1, 0) * lineHeight + lineInkHeight;
  const longestTokenWidth = longestTextTokenWidth(ctx, object.text || " ");
  const minWidth = Math.max(TEXT_BOX_MIN_WIDTH, longestTokenWidth + padding.left + padding.right);
  const minHeight = Math.max(TEXT_BOX_MIN_HEIGHT, height + padding.top + padding.bottom);
  return { width: object.width, height, minWidth, minHeight };
}

function textBoxConstraints(object: TextObject, width = object.width) {
  return measureTextBox({ ...object, width: Math.max(width, TEXT_BOX_MIN_WIDTH) });
}

function longestTextTokenWidth(ctx: CanvasRenderingContext2D, text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .reduce((max, token) => Math.max(max, ctx.measureText(token).width), 0);
}

function textBoxPadding(fontSize: number) {
  return {
    top: Math.max(18, fontSize * 0.24),
    right: Math.max(20, fontSize * 0.26),
    bottom: Math.max(26, fontSize * 0.38),
    left: Math.max(20, fontSize * 0.26),
  };
}

function measuredLineInkHeight(ctx: CanvasRenderingContext2D, fontSize: number) {
  const metrics = ctx.measureText("Mgjpqy");
  const measured = (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0);
  return Math.max(fontSize * 1.05, measured);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) {
  const safeMaxWidth = Math.max(maxWidth, fontSize * 2);
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const words = rawLine.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > safeMaxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line || " ");
  }
  return lines.length ? lines : [""];
}

function buildSearchResults(objects: BoardObject[], query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return objects.flatMap((object) => {
    const haystack = searchableTextForObject(object);
    if (!haystack.toLowerCase().includes(needle)) return [];
    const label = searchLabelForObject(object);
    return [{
      objectId: object.id,
      objectType: object.type,
      label,
      snippet: object.type === "text" ? makeSnippet(object.text, needle) : undefined,
      bounds: expandRect(objectBounds(object), object.type === "text" ? 10 : object.type === "stroke" ? object.size + 8 : object.size + 12),
    }];
  });
}

function searchableTextForObject(object: BoardObject) {
  const metadataValues = object.metadata ? Object.values(object.metadata).filter((value) => typeof value === "string") as string[] : [];
  const metadata = [object.label, object.note, object.type, ...metadataValues];
  if (object.type === "text") return [...metadata, object.text].filter(Boolean).join(" ");
  if (object.type === "shape") return [...metadata, object.shapeType, shapeAlias(object.shapeType)].filter(Boolean).join(" ");
  return [...metadata, "drawing", "stroke", "freehand"].filter(Boolean).join(" ");
}

function searchLabelForObject(object: BoardObject) {
  if (object.label?.trim()) return object.label.trim().slice(0, 48);
  if (object.type === "text") {
    const line = object.text.split("\n").find((item) => item.trim()) ?? "Text";
    return line.trim().slice(0, 48);
  }
  if (object.type === "shape") return object.shapeType === "ellipse" ? "circle / ellipse" : object.shapeType;
  return "drawing stroke";
}

function makeSnippet(text: string, needle: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const index = normalized.toLowerCase().indexOf(needle);
  if (index < 0) return normalized.slice(0, 90);
  const start = Math.max(0, index - 26);
  const end = Math.min(normalized.length, index + needle.length + 42);
  return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${end < normalized.length ? "..." : ""}`;
}

function shapeAlias(shapeType: ShapeKind) {
  if (shapeType === "ellipse") return "circle oval";
  if (shapeType === "rect") return "rectangle box square";
  return "";
}

function buildSearchClusters(results: SearchResult[]) {
  const clusters: Rect[] = [];
  for (const result of results) {
    let next = expandRect(result.bounds, 300);
    let merged = true;
    while (merged) {
      merged = false;
      for (let index = clusters.length - 1; index >= 0; index -= 1) {
        if (!rectsIntersect(next, clusters[index])) continue;
        next = unionRects(next, clusters[index]);
        clusters.splice(index, 1);
        merged = true;
      }
    }
    clusters.push(next);
  }
  return clusters;
}

function getViewportForBounds(bounds: Rect, canvasWidth: number, canvasHeight: number, paddingPx: number, maxScale = MAX_SCALE): Viewport {
  const safeWidth = Math.max(bounds.width, 1);
  const safeHeight = Math.max(bounds.height, 1);
  const scaleX = Math.max(canvasWidth - paddingPx * 2, 120) / safeWidth;
  const scaleY = Math.max(canvasHeight - paddingPx * 2, 120) / safeHeight;
  const targetScale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, Math.min(MAX_SCALE, maxScale));
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    scale: targetScale,
    offsetX: canvasWidth / 2 - centerX * targetScale,
    offsetY: canvasHeight / 2 - centerY * targetScale,
  };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

async function fetchInboxTodosFromApi() {
  const response = await fetch("/api/scheduled-inbox/todos", { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 501 && data.error === "Gmail integration not configured") {
      throw new Error("Gmail integration not configured");
    }
    throw new Error("Could not load inbox todos.");
  }
  return {
    accounts: Array.isArray(data.accounts) ? data.accounts as InboxAccount[] : [],
    todos: Array.isArray(data.todos) ? data.todos as InboxTodo[] : [],
  };
}

async function fetchInboxEmailPreviewFromApi(todo: InboxTodo) {
  const params = new URLSearchParams({
    preview: "1",
    accountId: todo.accountId || "",
    messageId: todo.emailMessageId || "",
  });
  const response = await fetch(`/api/scheduled-inbox/todos?${params.toString()}`, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load email preview.");
  return data as InboxEmailPreview;
}

function loadInboxStatus(): InboxStatusState {
  try {
    const parsed = JSON.parse(localStorage.getItem(INBOX_STATUS_STORAGE_KEY) ?? "{}") as Partial<InboxStatusState>;
    return { done: parsed.done ?? {}, dismissed: parsed.dismissed ?? {} };
  } catch {
    return { done: {}, dismissed: {} };
  }
}

function saveInboxStatus(status: InboxStatusState) {
  localStorage.setItem(INBOX_STATUS_STORAGE_KEY, JSON.stringify(status));
}

function hasStoredInboxPanel() {
  return localStorage.getItem(INBOX_PANEL_STORAGE_KEY) != null;
}

function loadInboxPanel(): InboxPanelState {
  try {
    const parsed = JSON.parse(localStorage.getItem(INBOX_PANEL_STORAGE_KEY) ?? "{}") as Partial<InboxPanelState>;
    return {
      isOpen: typeof parsed.isOpen === "boolean" ? parsed.isOpen : false,
      width: clampInboxPanelWidth(parsed.width ?? INBOX_PANEL_DEFAULT_WIDTH),
    };
  } catch {
    return { isOpen: false, width: INBOX_PANEL_DEFAULT_WIDTH };
  }
}

function clampInboxPanelWidth(width: number) {
  return clamp(width, INBOX_PANEL_MIN_WIDTH, Math.min(INBOX_PANEL_MAX_WIDTH, Math.max(INBOX_PANEL_MIN_WIDTH, window.innerWidth - 220)));
}

function usableCanvasWidth(panel: InboxPanelState) {
  if (!panel.isOpen) return window.innerWidth;
  return Math.max(260, window.innerWidth - clampInboxPanelWidth(panel.width));
}

function isDesktopInboxPanel() {
  return window.innerWidth >= INBOX_PANEL_DESKTOP_MIN_WIDTH;
}

function applyInboxStatus(todos: InboxTodo[], status: InboxStatusState) {
  return todos.map((todo) => ({
    ...todo,
    status: status.dismissed[todo.id] ? "dismissed" as const : status.done[todo.id] ? "done" as const : todo.status,
  }));
}

function visibleInboxTodos(todos: InboxTodo[]) {
  return todos.filter((todo) => todo.status === "open");
}

function urgencyLabel(urgency: InboxUrgency) {
  if (urgency === "high") return "HIGH";
  if (urgency === "medium") return "MED";
  return "LOW";
}

function saveStatusLabel(status: SaveStatus) {
  if (status === "saving") return "Saving...";
  if (status === "offline") return "Offline";
  if (status === "error") return "Error saving";
  return "Saved";
}

function formatInboxTodoText(todo: InboxTodo) {
  const detail = todo.subject || todo.contactName;
  const header = `${todo.title}${detail ? ` - ${detail}` : ""}${todo.dueDate ? ` (${todo.dueDate})` : ""}`;
  return [
    header,
    "",
    "Next:",
    todo.suggestedAction,
    ...(todo.suggestedDraft ? ["", "Draft:", todo.suggestedDraft] : []),
    "",
    "Context:",
    todo.reason,
  ].join("\n");
}

function accountForTodo(todo: InboxTodo, accounts: InboxAccount[]) {
  return accounts.find((account) => account.id === todo.accountId || account.email === todo.accountEmail) ?? {
    id: todo.accountId || "gmail",
    label: todo.accountLabel || "Gmail",
    email: todo.accountEmail || "",
    icon: todo.accountIcon,
    color: todo.accountColor,
  };
}

function accountIconImage(icon?: string, email?: string) {
  const key = `${icon || ""} ${email || ""}`.toLowerCase();
  if (key.includes("tchang") || key.trim() === "t") return "/account-icons/account-tchang.png";
  if (key.includes("changg") || key.includes("bird")) return "/account-icons/account-changg.png";
  return "";
}

function mockInboxResult(): { accounts: InboxAccount[]; todos: InboxTodo[] } {
  const now = new Date().toISOString();
  const accounts: InboxAccount[] = [
    { id: "umass", label: "UMass", email: "tchang@umass.edu", icon: "T", color: "#e8b7d0" },
    { id: "gmail", label: "Gmail", email: "changg.terry@gmail.com", icon: "bird", color: "#5f6fcb" },
  ];
  const todos: InboxTodo[] = [
    {
      id: "mock-shawn-followup",
      type: "follow_up",
      title: "Follow up with Shawn Durkin",
      contactName: "Shawn Durkin",
      subject: "Pelican Products",
      dueDate: "Today",
      urgency: "high",
      reason: "Important contact and follow-up window has passed.",
      suggestedAction: "Send short follow-up asking if Pelican is looking for a mechanical engineering intern or co-op.",
      suggestedDraft: "Hi Shawn, wanted to follow up quickly. I'm interested in learning whether Pelican is looking for a mechanical engineering intern or co-op. No rush, just wanted to stay on your radar.",
      source: "scheduled_inbox",
      accountId: "gmail",
      accountLabel: "Gmail",
      accountEmail: "changg.terry@gmail.com",
      accountIcon: "bird",
      accountColor: "#5f6fcb",
      status: "open",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "mock-prof-anderson-reply",
      type: "professor",
      title: "Reply to Prof. Anderson",
      contactName: "Prof. Anderson",
      subject: "REU application update",
      dueDate: "Tomorrow",
      urgency: "medium",
      reason: "Needs a response soon.",
      suggestedAction: "Reply with a concise update and ask for next steps.",
      source: "scheduled_inbox",
      accountId: "umass",
      accountLabel: "UMass",
      accountEmail: "tchang@umass.edu",
      accountIcon: "T",
      accountColor: "#e8b7d0",
      status: "open",
      createdAt: now,
      updatedAt: now,
    },
  ];
  return { accounts, todos };
}

function loadLibrary(): GreyboardLibrary {
  try {
    const raw = localStorage.getItem(GREYBOARD_LIBRARY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GreyboardLibrary>;
      const boards = parsed.boards ?? {};
      const ids = Object.keys(boards);
      if (ids.length) {
        const activeBoardId = parsed.activeBoardId && boards[parsed.activeBoardId] ? parsed.activeBoardId : ids[0];
        return { activeBoardId, boards: normalizeLibraryBoards(boards) };
      }
    }
  } catch {
    // Fall through to migration/default board.
  }

  const imported = loadState();
  if (imported.objects.length) {
    const board = createLibraryBoard("Imported Greyboard", imported);
    const library = { activeBoardId: board.id, boards: { [board.id]: board } };
    saveLibrary(library);
    return library;
  }

  const board = createLibraryBoard("Untitled Greyboard");
  const library = { activeBoardId: board.id, boards: { [board.id]: board } };
  saveLibrary(library);
  return library;
}

function normalizeLibraryBoards(boards: Record<string, GreyboardBoard>) {
  return Object.fromEntries(Object.entries(boards).map(([id, board]) => {
    const normalized: GreyboardBoard = {
      id: board.id || id,
      title: board.title?.trim() || "Untitled Greyboard",
      createdAt: board.createdAt || new Date().toISOString(),
      updatedAt: board.updatedAt || new Date().toISOString(),
      objects: normalizeObjects(Array.isArray(board.objects) ? board.objects : []),
      viewport: { ...DEFAULT_STATE.viewport, ...(board.viewport ?? {}) },
      settings: { ...DEFAULT_STATE.settings, ...(board.settings ?? {}) },
      inputGuideMode: board.inputGuideMode === "touchpad" ? "touchpad" : "mouse",
    };
    return [normalized.id, normalized];
  }));
}

function activeLibraryBoard(library: GreyboardLibrary) {
  return library.boards[library.activeBoardId] ?? Object.values(library.boards)[0] ?? createLibraryBoard("Untitled Greyboard");
}

function createLibraryBoard(title: string, state = cloneState(DEFAULT_STATE)): GreyboardBoard {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: title.trim() || "Untitled Greyboard",
    createdAt: now,
    updatedAt: now,
    objects: cloneObjects(state.objects),
    viewport: { ...state.viewport },
    settings: { ...state.settings },
    inputGuideMode: "mouse",
  };
}

function stateFromBoard(board: GreyboardBoard): BoardState {
  return {
    ...cloneState(DEFAULT_STATE),
    objects: normalizeObjects(board.objects),
    viewport: { ...DEFAULT_STATE.viewport, ...board.viewport },
    settings: { ...DEFAULT_STATE.settings, ...(board.settings ?? {}) },
    selectedIds: [],
    currentTool: "text",
  };
}

function saveLibrary(library: GreyboardLibrary) {
  localStorage.setItem(GREYBOARD_LIBRARY_STORAGE_KEY, JSON.stringify(library));
}

function previewTextForObject(object: BoardObject) {
  if (object.type === "text") return object.text.split("\n").find((line) => line.trim())?.trim().slice(0, 44) || "Text";
  if (object.type === "shape") return object.shapeType;
  return "drawing";
}

function formatBoardTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function loadState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneState(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<BoardState>;
    const objects = Array.isArray(parsed.objects) ? parsed.objects as BoardObject[] : [];
    return {
      ...cloneState(DEFAULT_STATE),
      objects: normalizeObjects(objects),
      viewport: { ...DEFAULT_STATE.viewport, ...(parsed.viewport ?? {}) },
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
      selectedIds: [],
      currentTool: "text",
    };
  } catch {
    return cloneState(DEFAULT_STATE);
  }
}

function normalizeObjects(objects: BoardObject[]) {
  return objects.map((object) => {
    const next = cloneObject(object);
    next.color = next.color || DEFAULT_INK;
    next.rotation = next.rotation ?? 0;
    if (!next.origin && next.type !== "text") {
      next.origin = next.type === "shape" && (next.shapeType === "line" || next.shapeType === "arrow" || next.shapeType === "curve")
        ? { ...(next.sourceStartPoint ?? next.rawStartPoint ?? firstGeometryPoint(next.geometry) ?? objectCenter(next)), mode: "start" }
        : centerOrigin(next.bbox);
    }
    return next;
  });
}

function cloneState(state: BoardState): BoardState {
  return {
    ...state,
    objects: cloneObjects(state.objects),
    selectedIds: [...state.selectedIds],
    viewport: { ...state.viewport },
    settings: { ...state.settings },
  };
}

function cloneObjects(objects: BoardObject[]) {
  return JSON.parse(JSON.stringify(objects)) as BoardObject[];
}

function cloneObject(object: BoardObject) {
  return JSON.parse(JSON.stringify(object)) as BoardObject;
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function eventPoint(event: { clientX: number; clientY: number }): Point {
  return { x: event.clientX, y: event.clientY };
}

function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  };
}

function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

function currentTheme(settings: Settings) {
  return THEME[settings.themeMode ?? "dark"];
}

function resolveInk(color: string, settings: Settings) {
  if (color === DEFAULT_INK || color.includes("248, 248, 238")) return currentTheme(settings).ink;
  return color;
}

function renderWithObjectRotation(ctx: CanvasRenderingContext2D, object: BoardObject, renderGeometry: () => void) {
  const rotation = object.rotation ?? 0;
  if (!rotation) {
    renderGeometry();
    return;
  }
  const origin = objectRotationOrigin(object);
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(rotation);
  ctx.translate(-origin.x, -origin.y);
  renderGeometry();
  ctx.restore();
}

function objectRotationOrigin(object: BoardObject): RotationOrigin {
  if (object.origin) return object.origin;
  if (object.type === "shape" && (object.shapeType === "line" || object.shapeType === "arrow" || object.shapeType === "curve")) {
    const start = object.sourceStartPoint ?? object.rawStartPoint ?? firstGeometryPoint(object.geometry);
    if (start) return { x: start.x, y: start.y, mode: "start" };
  }
  if (object.type === "text") return { x: object.x + object.width / 2, y: object.y + object.height / 2, mode: "center" };
  return centerOrigin(objectBounds(object));
}

function firstGeometryPoint(geometry: ShapeGeometry): Point | null {
  if ("start" in geometry && "end" in geometry) return geometry.start;
  if ("center" in geometry) return geometry.center;
  return geometry.points[0] ?? null;
}

function centerOrigin(rect: Rect): RotationOrigin {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, mode: "center" };
}

function movePoint(point: Point, dx: number, dy: number): Point {
  return { ...point, x: point.x + dx, y: point.y + dy };
}

function moveOrigin(origin: RotationOrigin, dx: number, dy: number): RotationOrigin {
  return { ...origin, x: origin.x + dx, y: origin.y + dy };
}

function rotatePoint(point: Point, origin: Point, rotation: number): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

function inverseRotatePoint(point: Point, origin: Point, rotation: number): Point {
  return rotatePoint(point, origin, -rotation);
}

function angleBetween(origin: Point, point: Point) {
  return Math.atan2(point.y - origin.y, point.x - origin.x);
}

function snapAngle(angle: number, incrementDegrees: number) {
  const increment = degreesToRadians(Math.max(1, incrementDegrees));
  return Math.round(angle / increment) * increment;
}

function localToWorldText(point: Point, object: TextObject): Point {
  const rotation = object.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: object.x + point.x * cos - point.y * sin,
    y: object.y + point.x * sin + point.y * cos,
  };
}

function worldToLocalText(point: Point, object: TextObject): Point {
  const dx = point.x - object.x;
  const dy = point.y - object.y;
  const rotation = object.rotation ?? 0;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

function pointsBounds(points: Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

function removeDuplicatePoints(points: Point[]) {
  return points.filter((point, index) => index === 0 || distance(point, points[index - 1]) > 0.35);
}

function smoothPoints(points: Point[]) {
  if (points.length < 4) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const prev = points[index - 1];
    const next = points[index + 1];
    return {
      ...point,
      x: point.x * 0.5 + (prev.x + next.x) * 0.25,
      y: point.y * 0.5 + (prev.y + next.y) * 0.25,
    };
  });
}

function simplifyRdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointToSegmentDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) {
      index = i;
      maxDistance = d;
    }
  }
  if (maxDistance > epsilon) {
    const left = simplifyRdp(points.slice(0, index + 1), epsilon);
    const right = simplifyRdp(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function removeNearDuplicateClosed(points: Point[]) {
  if (points.length > 2 && distance(points[0], points[points.length - 1]) < 20) {
    return points.slice(0, -1);
  }
  return points;
}

function pathLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

function maxLineDeviation(points: Point[], a: Point, b: Point) {
  return Math.max(...points.map((point) => pointToSegmentDistance(point, a, b)));
}

function quadraticControlFromMid(start: Point, mid: Point, end: Point): Point {
  return {
    x: 2 * mid.x - (start.x + end.x) / 2,
    y: 2 * mid.y - (start.y + end.y) / 2,
  };
}

function sampleQuadratic(start: Point, control: Point, end: Point, steps: number) {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    });
  }
  return points;
}

function averageCurveError(source: Point[], fitted: Point[]) {
  const sampleCount = Math.min(source.length, 42);
  let total = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const sourceIndex = Math.round((i / Math.max(sampleCount - 1, 1)) * (source.length - 1));
    const fitIndex = Math.round((i / Math.max(sampleCount - 1, 1)) * (fitted.length - 1));
    total += distance(source[sourceIndex], fitted[fitIndex]);
  }
  return total / Math.max(sampleCount, 1);
}

function pointToSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function seededNoise(seed: string, index: number) {
  let h = 2166136261;
  const source = `${seed}:${index}`;
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967295 - 0.5) * 2;
}

function boardRefSafe(): BoardState {
  return runtimeBoardState;
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<Ghostboard />);
