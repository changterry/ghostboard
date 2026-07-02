import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tool = "select" | "text" | "draw" | "erase" | "pan" | "shape";
type ShapeKind = "line" | "arrow" | "ellipse" | "rect" | "triangle" | "curve";
type ThemeMode = "dark" | "light";
type InputGuideMode = "mouse" | "touchpad";

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

type Interaction =
  | { type: "none" }
  | { type: "pending-canvas"; pointerId: number; startScreen: Point; startWorld: Point; startedAt: number; forceAngleSnap: boolean }
  | { type: "pan"; pointerId: number; last: Point }
  | { type: "draw"; pointerId: number; points: Point[]; forceAngleSnap: boolean }
  | { type: "erase"; pointerId: number; erasedIds: Set<string>; before: BoardObject[]; cursor: Point; deleteText: boolean }
  | { type: "move"; pointerId: number; id: string; start: Point; objectStart: BoardObject; before: BoardObject[] }
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

const STORAGE_KEY = "ghostboard.state.v1";
const EMPTY_INTERACTION: Interaction = { type: "none" };
const DEFAULT_INK = "defaultInk";
const MIN_SCALE = 0.18;
const MAX_SCALE = 5;
const HIT_TOLERANCE = 12;
const CLICK_MAX_DURATION_MS = 250;
const DRAG_THRESHOLD_PX = 5;
const DEFAULT_TEXT_LINE_HEIGHT = 1.16;
const TEXT_FONT_FAMILY = "\"Segoe Print\", \"Comic Sans MS\", \"Bradley Hand ITC\", cursive";
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
    accent: "#E85D04",
    accentText: "#ffffff",
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
    accent: "#E85D04",
    accentText: "#ffffff",
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

const TOOL_LABELS: Array<{ id: Tool | "clear" | "settings"; label: string; hint: string; icon: string }> = [
  { id: "select", label: "Select / Move", hint: "Move, resize, rotate", icon: "↖" },
  { id: "text", label: "Text", hint: "Click anywhere for big text", icon: "T" },
  { id: "draw", label: "Draw", hint: "Freehand chalk", icon: "⌁" },
  { id: "erase", label: "Erase", hint: "Delete whole strokes", icon: "⌫" },
  { id: "shape", label: "Smart Shape", hint: "Snap rough shapes", icon: "△" },
  { id: "pan", label: "Pan", hint: "Drag the board", icon: "H" },
  { id: "clear", label: "Clear Board", hint: "Remove everything", icon: "⌧" },
  { id: "settings", label: "Settings", hint: "Snap and appearance", icon: "⚙" },
];

function Ghostboard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<BoardState>(loadState());
  const interactionRef = useRef<Interaction>(EMPTY_INTERACTION);
  const historyRef = useRef<BoardObject[][]>([]);
  const redoRef = useRef<BoardObject[][]>([]);
  const rafRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSnapRef = useRef<PendingSnap | null>(null);
  const activeEditorRef = useRef<EditorState | null>(null);
  const toolToggleClickRef = useRef<{ button: number; time: number; point: Point } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [inputGuideMode, setInputGuideMode] = useState<InputGuideMode>("mouse");
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
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
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
  }, []);

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

      if (event.key === "Escape") {
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

      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearConfirmOpen, editor, settingsOpen, sidebarOpen]);

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
    const { objects, viewport, settings } = boardRef.current;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects, viewport, settings }));
  }

  function setTool(tool: Tool) {
    commitEditor();
    setClearConfirmOpen(false);
    boardRef.current.currentTool = tool;
    setSidebarOpen(false);
    save();
    forceUpdate();
  }

  function toggleTextDrawTool() {
    commitEditor();
    cancelPendingSnap();
    const tool = boardRef.current.currentTool;
    boardRef.current.currentTool = tool === "draw" || tool === "shape" ? "text" : "draw";
    setSidebarOpen(false);
    setSettingsOpen(false);
    save();
    forceUpdate();
  }

  function isDoubleUtilityClick(button: number, point: Point) {
    const now = window.performance.now();
    const previous = toolToggleClickRef.current;
    toolToggleClickRef.current = { button, time: now, point };
    return Boolean(previous && previous.button === button && now - previous.time < 360 && distance(previous.point, point) < 26);
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
      boardRef.current.selectedIds = [];
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
    object.width = Math.max(object.fontSize * 1.8, metrics.width);
    object.height = Math.max(metrics.height, object.fontSize * 1.35);
    save();
    forceUpdate();
    requestRender();
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

    const screen = eventPoint(event);
    const world = screenToWorld(screen, boardRef.current.viewport);
    const state = boardRef.current;
    const isMiddlePan = event.button === 1;
    const isRightErase = event.button === 2;

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

    if ((event.button === 1 || event.button === 2) && isDoubleUtilityClick(event.button, screen)) {
      event.preventDefault();
      toggleTextDrawTool();
      return;
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

    const handle = hitSelectionHandle(world);
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
      state.selectedIds = [hit.id];
      forceUpdate();
      canvas.setPointerCapture(event.pointerId);
      interactionRef.current = { type: "move", pointerId: event.pointerId, id: hit.id, start: world, objectStart: cloneObject(hit), before: cloneObjects(state.objects) };
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
    const interaction = interactionRef.current;
    const screen = eventPoint(event);
    const world = screenToWorld(screen, boardRef.current.viewport);

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

    if (interaction.type === "erase" && interaction.pointerId === event.pointerId) {
      interaction.cursor = world;
      eraseAt(world);
      return;
    }

    if (interaction.type === "move" && interaction.pointerId === event.pointerId) {
      const object = boardRef.current.objects.find((item) => item.id === interaction.id);
      if (!object) return;
      const dx = world.x - interaction.start.x;
      const dy = world.y - interaction.start.y;
      applyMove(object, interaction.objectStart, dx, dy);
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
    for (const object of state.objects) {
      if (activeEditorId === object.id) continue;
      renderObject(ctx, object, state.settings);
    }

    const drawing = interactionRef.current.type === "draw" ? interactionRef.current.points : null;
    if (drawing && drawing.length > 1) {
      renderStrokePath(ctx, drawing, 7, resolveInk(DEFAULT_INK, state.settings), 0.86, true, "preview");
    }

    if (interactionRef.current.type === "erase") {
      renderEraserCursor(ctx, interactionRef.current.cursor, HIT_TOLERANCE / state.viewport.scale);
    }

    const selected = state.objects.find((object) => object.id === state.selectedIds[0]);
    if (selected && activeEditorId !== selected.id) {
      renderSelection(ctx, selected, state.settings);
    }
    ctx.restore();
  }

  const editorObject = editor ? boardRef.current.objects.find((object) => object.id === editor.id && object.type === "text") as TextObject | undefined : undefined;
  const editorStyle = editorObject ? makeEditorStyle(editorObject, boardRef.current.viewport) : undefined;

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
        "--gb-accent": theme.accent,
        "--gb-accent-text": theme.accentText,
      } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className="board-canvas"
        aria-label="Ghostboard canvas"
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
          onBlur={commitEditor}
        />
      )}

      <button className="menu-button" type="button" aria-label="Toggle tools" onClick={() => setSidebarOpen((open) => !open)}>
        <span />
        <span />
        <span />
      </button>

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
        <div className="brand">
          <strong>Ghostboard</strong>
          <span>Minimal. Distraction-free.</span>
        </div>

        <div className="tool-list" role="toolbar" aria-label="Ghostboard tools">
          {TOOL_LABELS.map((tool) => (
            <button
              key={tool.id}
              className={`sidebar-tool ${boardRef.current.currentTool === tool.id ? "is-active" : ""}`}
              type="button"
              onClick={() => {
                if (tool.id === "clear") clearBoard();
                else if (tool.id === "settings") setSettingsOpen((open) => !open);
                else setTool(tool.id);
              }}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span>
                <strong>{tool.label}</strong>
                <small>{tool.hint}</small>
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
                onClick={() => setInputGuideMode(mode)}
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
                <span>Middle mouse drag = pan</span>
                <span>Control + scroll = zoom</span>
                <span>Shift + scroll = horizontal pan</span>
                <span>Undo / redo: Control Z and Control Y</span>
                <span>Double-click text to edit</span>
              </>
            ) : (
              <>
                <span>Tap empty space = text</span>
                <span>Press and drag = draw</span>
                <span>Two-finger drag = pan</span>
                <span>Control + two-finger scroll = zoom</span>
                <span>Shift + two-finger scroll = horizontal pan</span>
                <span>Undo / redo: Control Z and Control Y</span>
                <span>Double-tap text to edit</span>
              </>
            )}
          </div>
        </div>
      </aside>
    </main>
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
  ctx.fillStyle = ink;
  ctx.shadowColor = settings.themeMode === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.24)";
  ctx.shadowBlur = settings.chalkTexture ? 5 : 0;
  ctx.font = `${object.fontSize}px ${TEXT_FONT_FAMILY}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";

  const lines = wrapText(ctx, object.text, object.width, object.fontSize);
  const lineHeightFactor = object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT;
  const lineHeight = object.fontSize * lineHeightFactor;
  const visualTopOffset = getTextVisualTopOffset(ctx, object.fontSize, lineHeightFactor);
  lines.forEach((line, index) => {
    const y = visualTopOffset + index * lineHeight;
    ctx.fillText(line, 0, y);
    if (settings.chalkTexture) {
      ctx.globalAlpha = object.opacity * 0.13;
      ctx.fillText(line, seededNoise(object.id, index) * 1.4, y + seededNoise(object.id, index + 99) * 1.2);
      ctx.globalAlpha = object.opacity;
    }
  });
  ctx.restore();
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

function renderSelection(ctx: CanvasRenderingContext2D, object: BoardObject, settings: Settings) {
  const box = objectBounds(object);
  const handles = selectionHandles(object);
  const origin = objectRotationOrigin(object);
  const rotation = object.rotation ?? 0;
  const scale = currentScale(ctx);
  ctx.save();
  ctx.strokeStyle = currentTheme(settings).handle;
  ctx.lineWidth = 1.2 / scale;
  ctx.setLineDash([7 / scale, 6 / scale]);

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
        ctx.fillRect(local.x - 5 / scale, local.y - 5 / scale, 10 / scale, 10 / scale);
        ctx.strokeRect(local.x - 5 / scale, local.y - 5 / scale, 10 / scale, 10 / scale);
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
    { name: "ne", point: localToWorldText({ x: object.width, y: 0 }, object) },
    { name: "se", point: localToWorldText({ x: object.width, y: object.height }, object) },
    { name: "sw", point: localToWorldText({ x: 0, y: object.height }, object) },
    { name: "rotate", point: localToWorldText({ x: object.width / 2, y: -42 }, object) },
  ];
  return corners;
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
    const minWidth = object.fontSize * 1.8;
    const minHeight = object.fontSize * 1.15;
    if (handle.includes("e")) object.width = Math.max(minWidth, original.width + dx);
    if (handle.includes("s")) object.height = Math.max(minHeight, original.height + dy);
    if (handle.includes("w")) {
      const width = Math.max(minWidth, original.width - dx);
      object.x = original.x + (original.width - width);
      object.width = width;
    }
    if (handle.includes("n")) {
      const height = Math.max(minHeight, original.height - dy);
      object.y = original.y + (original.height - height);
      object.height = height;
    }
    object.updatedAt = Date.now();
  }
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

function shapeBounds(shapeType: ShapeKind, geometry: ShapeGeometry): Rect {
  if ("start" in geometry && "end" in geometry) return pointsBounds([geometry.start, geometry.end]);
  if ("center" in geometry) return { x: geometry.center.x - geometry.rx, y: geometry.center.y - geometry.ry, width: geometry.rx * 2, height: geometry.ry * 2 };
  return pointsBounds(shapeType === "triangle" || shapeType === "rect" ? geometry.points : [...geometry.points]);
}

function makeEditorStyle(object: TextObject, viewport: Viewport): React.CSSProperties {
  const screen = worldToScreen({ x: object.x, y: object.y }, viewport);
  const scaledFontSize = object.fontSize * viewport.scale;
  const scaledLineHeight = object.fontSize * (object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT) * viewport.scale;
  return {
    left: `${screen.x}px`,
    top: `${screen.y}px`,
    width: `${object.width * viewport.scale}px`,
    height: `${Math.max(object.height, object.fontSize * 1.35) * viewport.scale}px`,
    fontSize: `${scaledFontSize}px`,
    lineHeight: `${scaledLineHeight}px`,
    fontFamily: TEXT_FONT_FAMILY,
    transform: `rotate(${object.rotation ?? 0}rad)`,
    transformOrigin: "0 0",
  };
}

function measureTextBox(object: TextObject) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: object.width, height: object.height };
  ctx.font = `${object.fontSize}px ${TEXT_FONT_FAMILY}`;
  const lines = (object.text || "").split("\n");
  const width = Math.max(...lines.map((line) => ctx.measureText(line || " ").width), object.fontSize * 2) + 20;
  const height = Math.max(lines.length, 1) * object.fontSize * (object.lineHeight ?? DEFAULT_TEXT_LINE_HEIGHT);
  return { width, height };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) {
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const words = rawLine.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
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
