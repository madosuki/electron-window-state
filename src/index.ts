import { app, screen, BrowserWindow, Display } from 'electron';
import path from 'path';
import mkdirp from 'mkdirp';
import jsonfile from 'jsonfile';

export type WindowBounds = {
    width: number;
    height: number;
    x: number | undefined;
    y: number | undefined;
}

export type DisplayBounds = {
    width: number;
    height: number;
    x: number;
    y: number
}

export type Options = {
    file?: string;
    path?: string;
    maximize?: boolean;
    fullScreen?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
}

export type State = {
    windowBounds: WindowBounds;
    displayBounds: DisplayBounds;
    isFullScreen: boolean;
    isMaximized: boolean;
}

export type IWindowStateKeeper = {
  getState: () => State | undefined;
  unmanage: () => void;
  manage: (win: BrowserWindow) => void;
  saveState: (win: BrowserWindow) => void;  
}

const defaultWindowBounds = {
    width: 800,
    height: 600,
    x: undefined,
    y: undefined
};

const defaultDisplayBounds = {
    width: 0,
    height: 0,
    x: 0,
    y: 0
};

module.exports = function (options?: Options): IWindowStateKeeper {
    let winRef: BrowserWindow | undefined;
    let isManage = false;
    const eventHandlingDelay = 100;
    let stateChangeTimer: any;
    let readedData: State | undefined;
    let state: State | undefined;
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

                const windowBounds: WindowBounds = {
                    width: readedData.windowBounds.width,
                    height: readedData.windowBounds.height,
                    x: readedData.windowBounds.x,
                    y: readedData.windowBounds.y
                };

                const displayBounds: DisplayBounds = {
                    width: readedData.displayBounds.width,
                    height: readedData.displayBounds.height,
                    x: readedData.displayBounds.x,
                    y: readedData.displayBounds.y
                };

                state = {
                    windowBounds: windowBounds,
                    displayBounds: displayBounds,
                    isFullScreen: readedData.isFullScreen,
                    isMaximized: readedData.isMaximized
                };

                const result = validateState();
                if (!result) {
                    state = undefined;
                } 
            }
        } catch (err) {
            // Don't care
        }
    }

    if (!state) {
        const windowBounds = defaultWindowBounds;
        if (config) {
            if (config.defaultHeight) {
                windowBounds.height = config.defaultHeight;
            }

            if (config.defaultWidth) {
                windowBounds.width = config.defaultWidth;
            }
        }

        state = {
            windowBounds: windowBounds,
            displayBounds: defaultDisplayBounds,
            isFullScreen: false,
            isMaximized: false,
        };
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
    
    function windowWithinBounds(bounds: DisplayBounds): boolean {
        if (!state) {
            return true;
        }
    
        const stateX = state.windowBounds.x || 0;
        const stateY = state.windowBounds.y || 0;
        return (
            stateX >= bounds.x &&
        stateY >= bounds.y &&
        stateX + state.windowBounds.width <= bounds.x + bounds.width &&
        stateY + state.windowBounds.height <= bounds.y + bounds.height
        );
    }
    
    function resizeAndReplaceWindowForWorkArea(display: Display) {
        if (!state || state.isFullScreen || state.isMaximized) {
            return;
        }
    
    
        const stateX = state.windowBounds.x || 0;
        const stateY = state.windowBounds.y || 0;
    
        if (state.windowBounds.width > display.workArea.width) {
            state.windowBounds.width = display.workArea.width;
        }
    
        if (state.windowBounds.height > display.workArea.height) {
            state.windowBounds.height = display.workArea.height;
        }
    
        // for left taskbar
        if (stateX < display.workArea.x) {
            state.windowBounds.x = display.workArea.x;
        }
    
        // for right taskbar
        if (stateX + state.windowBounds.width > display.workArea.width) {
            state.windowBounds.x = display.workArea.x + display.workArea.width - state.windowBounds.width;
        }
    
        // for top taskbar
        if (stateY < display.bounds.height - display.workArea.height) {
            state.windowBounds.y = display.workArea.y;
        }
    
        // for bottom taskbar
        if (stateY + state.windowBounds.height > display.workArea.height) {
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
            return false;
        }
    
        const isValid = state && (hasBounds() || state.isMaximized || state.isFullScreen);
        if (!isValid) {
            return false;
        }
    
        if (hasBounds() && state.displayBounds) {
            ensureWindowVisibleOnSomeDisplay();
        }
    
        return true;
    }
    
    function resetStateToDefault() {
        const displayBounds = screen.getPrimaryDisplay().bounds;
    
        // Reset state to default values on the primary display
        let tmp: State = {
            windowBounds: {
                width: 800,
                height: 600,
                x: undefined,
                y: undefined,
            },
            displayBounds: displayBounds,
            isMaximized: false,
            isFullScreen: false
        };
    
        state = tmp;
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
                return true;
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
                return true;
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
    
    function getState() {
        return state;
    }
    
    function saveState(win?: BrowserWindow) {
        if (!state) {
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

    return {
        getState,
        saveState,
        unmanage,
        manage,
    }
    
}



