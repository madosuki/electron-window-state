import { app, screen, BrowserWindow, Rectangle, Display } from "electron";
import path from "path";
import mkdirp from "mkdirp";
import jsonfile from "jsonfile";

type WindowBounds = {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
}

type DisplayBounds = {
    width: number;
    height: number;
    x: number;
    y: number
}

type Options = {
    file?: string;
    path?: string;
    maximize?: boolean;
    fullScreen?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
}

type State = {
    windowBounds: WindowBounds;
    displayBounds: DisplayBounds;
    isFullScreen: boolean;
    isMaximized: boolean;
}

module.exports = function(options?: Options) {

let winRef: BrowserWindow;
let isManage = false;
const eventHandlingDelay = 100;
let stateChangeTimer: any;
let state: State | undefined;
let readedData: State | undefined;

let config: Options;
let fullStoreFileName: string | undefined;
config = Object.assign({
        file: 'window-state.json',
        path: app.getPath('userData'),
        maximize: true,
        fullScreen: true
}, options);

if (config.path && config.file) {
    fullStoreFileName = path.join(config.path, config.file);
}
if (fullStoreFileName) {
    // Load previous state
    try {
        readedData = jsonfile.readFileSync(fullStoreFileName);
        if (readedData) {
            state = readedData;
            validateState();
        }
    } catch (err) {
        // Don't care
    }
}


function isNormal(win: BrowserWindow) {
    if (!isManage) {
        return false;
    }
    
    return !win.isMaximized() && !win.isMinimized() && !win.isFullScreen();
}

function hasBounds() {
    return state &&
      Number.isInteger(state.windowBounds.x) &&
      Number.isInteger(state.windowBounds.y) &&
      Number.isInteger(state.windowBounds.width) && state.windowBounds.width > 0 &&
      Number.isInteger(state.windowBounds.height) && state.windowBounds.height > 0;
}

function resetStateToDefault() {
    if (!state) { return; }

    const displayBounds = screen.getPrimaryDisplay().bounds;

    // Reset state to default values on the primary display
    state.windowBounds = {
      width: config.defaultWidth || 800,
      height: config.defaultHeight || 600,
      x: undefined,
      y: undefined,
    };

    state.displayBounds = displayBounds;
}

function windowWithinBounds(bounds: DisplayBounds) {
    if (!state) {
        return false;
    }

    return (
      state.windowBounds.x || 0 >= bounds.x &&
      state.windowBounds.y || 0 >= bounds.y &&
      state.windowBounds.x || 0 + state.windowBounds.width <= bounds.x + bounds.width &&
      state.windowBounds.y || 0 + state.windowBounds.height <= bounds.y + bounds.height
    );
}

function resizeAndReplaceWindowForWorkArea(display: Display) {
    if (!state || state.isFullScreen || state.isMaximized) {
      return;
    }

    if (state.windowBounds.width > display.workArea.width) {
      state.windowBounds.width = display.workArea.width;
    }

    if (state.windowBounds.height > display.workArea.height) {
      state.windowBounds.height = display.workArea.height;
    }

    // for left taskbar
    if (state.windowBounds.x || 0 < display.workArea.x) {
      state.windowBounds.x = display.workArea.x;
    }

    // for right taskbar
    if (state.windowBounds.x || 0 + state.windowBounds.width > display.workArea.width) {
      state.windowBounds.x = display.workArea.x + display.workArea.width - state.windowBounds.width;
    }

    // for top taskbar
    if (state.windowBounds.y || 0 < display.bounds.height - display.workArea.height) {
      state.windowBounds.y = display.workArea.y;
    }

    // for bottom taskbar
    if (state.windowBounds.y || 0 + state.windowBounds.height > display.workArea.height) {
      state.windowBounds.y = display.workArea.y + display.workArea.height - state.windowBounds.height;
    }
}

function ensureWindowVisibleOnSomeDisplay() {
    const display = screen.getAllDisplays().find(v => windowWithinBounds(v.bounds));

    if (!display) {
      // Window is partially or fully not visible now.
      // Reset it to safe defaults.
      return resetStateToDefault();
    }

    resizeAndReplaceWindowForWorkArea(display);
}

function validateState() {

    if (!state) {
        return;
    }

    const isValid = state && (hasBounds() || state.isMaximized || state.isFullScreen);
    if (!isValid) {
        state = undefined;
        return;
    }

    if (hasBounds() && state.displayBounds) {
      ensureWindowVisibleOnSomeDisplay();
    }
}

function updateState(win?: BrowserWindow) {
    win = win || winRef;
    if (!win || !state || !isManage) {
      return;
    }
    // Don't throw an error when window was closed
    try {
      const winBounds = win.getBounds();
      if (isNormal(win)) {
        state.windowBounds.x = winBounds.x;
        state.windowBounds.y = winBounds.y;
        state.windowBounds.width = winBounds.width;
        state.windowBounds.height = winBounds.height;
      }
      state.isMaximized = win.isMaximized();
      state.isFullScreen = win.isFullScreen();
      state.displayBounds = screen.getDisplayMatching(winBounds).bounds;
    // eslint-disable-next-line no-empty
    } catch (err) {}
}

function checkUpdatedStateCompareToReadedData() {
    if (!readedData) {
      return true;
    }

    const checkWhetherHaveUpdatedDisplayBounds = () => {
        if (!readedData || !state) {
            return false;
        }

        if (readedData.displayBounds.x !== state.displayBounds.x ||
            readedData.displayBounds.y !== state.displayBounds.y ||
            readedData.displayBounds.width !== state.displayBounds.width ||
            readedData.displayBounds.height !== state.displayBounds.height) {
            return true;
        }

        return false;
    };
    
    const checkWhetherHaveUpdatedCoordAndSize = () => {
      if (!readedData || !state) {
          return false;
      }

      if (readedData.windowBounds.x !== state.windowBounds.x ||
          readedData.windowBounds.y !== state.windowBounds.y || 
          readedData.windowBounds.width !== state.windowBounds.width ||
          readedData.windowBounds.height !== state.windowBounds.height ||
          readedData.isMaximized !== state.isMaximized ||
          readedData.isFullScreen !== state.isFullScreen) {
            return true;
        }
      
      return false; 
    };
  
    if (checkWhetherHaveUpdatedDisplayBounds() || checkWhetherHaveUpdatedCoordAndSize()) {
      return true;
    }

    return false;
}

function saveState(win?: BrowserWindow) {
    if (!isManage) {
        return;
    }
    // Update window state only if it was provided
    if (win) {
      updateState(win);
    }

    if (!checkUpdatedStateCompareToReadedData()) {
      return;
    }

    // Save state
    if (fullStoreFileName) {
        try {
            mkdirp.sync(path.dirname(fullStoreFileName));
            jsonfile.writeFileSync(fullStoreFileName, state);
        } catch (err) {
            // Don't care
        }
    }
}

function stateChangeHandler() {
    // Handles both 'resize' and 'move'
    clearTimeout(stateChangeTimer);
    stateChangeTimer = setTimeout(updateState, eventHandlingDelay);
  }

function closeHandler() {
  updateState();
}

function closedHandler() {
  // Unregister listeners and save state
  unmanage();
  saveState();
}

function manage(win: BrowserWindow) {

    if (!state) {
        return;
    }

    if (config.maximize && state.isMaximized) {
      win.maximize();
    }
    if (config.fullScreen && state.isFullScreen) {
      win.setFullScreen(true);
    }
    win.on('resize', stateChangeHandler);
    win.on('move', stateChangeHandler);
    win.on('close', closeHandler);
    win.on('closed', closedHandler);
    winRef = win;
    isManage = true;
}

function unmanage() {
    if (winRef) {
      winRef.removeListener('resize', stateChangeHandler);
      winRef.removeListener('move', stateChangeHandler);
      clearTimeout(stateChangeTimer);
      winRef.removeListener('close', closeHandler);
      winRef.removeListener('closed', closedHandler);

      isManage = false;
    }
}
}