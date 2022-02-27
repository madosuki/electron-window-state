import { app, screen, BrowserWindow, Rectangle, Display } from "electron";
import path from "path";
import mkdirp from "mkdirp";
import jsonfile from "jsonfile";

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

export interface IWindowStateKeeper {
  state: State | undefined;
  manage: (win: BrowserWindow) => void;
  unmanage: () => void;
  saveState: (win: BrowserWindow) => void;
}

export class WindowStateKeeper implements IWindowStateKeeper {

  winRef: BrowserWindow | undefined;
  isManage = false;
  eventHandlingDelay = 100;
  stateChangeTimer: any;
  state: State | undefined;
  readedData: State | undefined;

  config: Options;
  fullStoreFileName: string | undefined;

  constructor(options?: Options) {
    this.config = Object.assign({
        file: 'window-state.json',
        path: app.getPath('userData'),
        maximize: true,
        fullScreen: true
    }, options);

    if (this.config.path && this.config.file) {
        this.fullStoreFileName = path.join(this.config.path, this.config.file);
    }
    if (this.fullStoreFileName) {
      // Load previous state
      try {
          this.readedData = jsonfile.readFileSync(this.fullStoreFileName);
          if (this.readedData) {
              this.state = this.readedData;
              this.validateState();
          }
      } catch (err) {
          // Don't care
      }
    }
  }


 isNormal(win: BrowserWindow) {
    if (!this.isManage) {
        return false;
    }
    
    return !win.isMaximized() && !win.isMinimized() && !win.isFullScreen();
}

hasBounds() {
    return this.state &&
      Number.isInteger(this.state.windowBounds.x) &&
      Number.isInteger(this.state.windowBounds.y) &&
      Number.isInteger(this.state.windowBounds.width) && this.state.windowBounds.width > 0 &&
      Number.isInteger(this.state.windowBounds.height) && this.state.windowBounds.height > 0;
}

resetStateToDefault() {
    if (!this.state) { return; }

    const displayBounds = screen.getPrimaryDisplay().bounds;

    // Reset state to default values on the primary display
    this.state.windowBounds = {
      width: this.config.defaultWidth || 800,
      height: this.config.defaultHeight || 600,
      x: undefined,
      y: undefined,
    };

    this.state.displayBounds = displayBounds;
}

windowWithinBounds(bounds: DisplayBounds) {
    if (!this.state) {
        return false;
    }

    return (
      this.state.windowBounds.x || 0 >= bounds.x &&
      this.state.windowBounds.y || 0 >= bounds.y &&
      this.state.windowBounds.x || 0 + this.state.windowBounds.width <= bounds.x + bounds.width &&
      this.state.windowBounds.y || 0 + this.state.windowBounds.height <= bounds.y + bounds.height
    );
}

resizeAndReplaceWindowForWorkArea(display: Display) {
    if (!this.state || this.state.isFullScreen || this.state.isMaximized) {
      return;
    }

    if (this.state.windowBounds.width > display.workArea.width) {
      this.state.windowBounds.width = display.workArea.width;
    }

    if (this.state.windowBounds.height > display.workArea.height) {
      this.state.windowBounds.height = display.workArea.height;
    }

    // for left taskbar
    if (this.state.windowBounds.x || 0 < display.workArea.x) {
      this.state.windowBounds.x = display.workArea.x;
    }

    // for right taskbar
    if (this.state.windowBounds.x || 0 + this.state.windowBounds.width > display.workArea.width) {
      this.state.windowBounds.x = display.workArea.x + display.workArea.width - this.state.windowBounds.width;
    }

    // for top taskbar
    if (this.state.windowBounds.y || 0 < display.bounds.height - display.workArea.height) {
      this.state.windowBounds.y = display.workArea.y;
    }

    // for bottom taskbar
    if (this.state.windowBounds.y || 0 + this.state.windowBounds.height > display.workArea.height) {
      this.state.windowBounds.y = display.workArea.y + display.workArea.height - this.state.windowBounds.height;
    }
}

ensureWindowVisibleOnSomeDisplay() {
    const display = screen.getAllDisplays().find(v => this.windowWithinBounds(v.bounds));

    if (!display) {
      // Window is partially or fully not visible now.
      // Reset it to safe defaults.
      return this.resetStateToDefault();
    }

    this.resizeAndReplaceWindowForWorkArea(display);
}

validateState() {

    if (!this.state) {
        return;
    }

    const isValid = this.state && (this.hasBounds() || this.state.isMaximized || this.state.isFullScreen);
    if (!isValid) {
        this.state = undefined;
        return;
    }

    if (this.hasBounds() && this.state.displayBounds) {
      this.ensureWindowVisibleOnSomeDisplay();
    }
}

updateState(win?: BrowserWindow) {
    win = win || this.winRef;
    if (!win || !this.state || !this.isManage) {
      return;
    }
    // Don't throw an error when window was closed
    try {
      const winBounds = win.getBounds();
      if (this.isNormal(win)) {
        this.state.windowBounds.x = winBounds.x;
        this.state.windowBounds.y = winBounds.y;
        this.state.windowBounds.width = winBounds.width;
        this.state.windowBounds.height = winBounds.height;
      }
      this.state.isMaximized = win.isMaximized();
      this.state.isFullScreen = win.isFullScreen();
      this.state.displayBounds = screen.getDisplayMatching(winBounds).bounds;
    // eslint-disable-next-line no-empty
    } catch (err) {}
}

checkUpdatedStateCompareToReadedData() {
    if (!this.readedData) {
      return true;
    }

    const checkWhetherHaveUpdatedDisplayBounds = () => {
        if (!this.readedData || !this.state) {
            return false;
        }

        if (this.readedData.displayBounds.x !== this.state.displayBounds.x ||
            this.readedData.displayBounds.y !== this.state.displayBounds.y ||
            this.readedData.displayBounds.width !== this.state.displayBounds.width ||
            this.readedData.displayBounds.height !== this.state.displayBounds.height) {
            return true;
        }

        return false;
    };
    
    const checkWhetherHaveUpdatedCoordAndSize = () => {
      if (!this.readedData || !this.state) {
          return false;
      }

      if (this.readedData.windowBounds.x !== this.state.windowBounds.x ||
          this.readedData.windowBounds.y !== this.state.windowBounds.y || 
          this.readedData.windowBounds.width !== this.state.windowBounds.width ||
          this.readedData.windowBounds.height !== this.state.windowBounds.height ||
          this.readedData.isMaximized !== this.state.isMaximized ||
          this.readedData.isFullScreen !== this.state.isFullScreen) {
            return true;
        }
      
      return false; 
    };
  
    if (checkWhetherHaveUpdatedDisplayBounds() || checkWhetherHaveUpdatedCoordAndSize()) {
      return true;
    }

    return false;
}

saveState(win?: BrowserWindow) {
    if (!this.isManage) {
        return;
    }
    // Update window state only if it was provided
    if (win) {
      this.updateState(win);
    }

    if (!this.checkUpdatedStateCompareToReadedData()) {
      return;
    }

    // Save state
    if (this.fullStoreFileName) {
        try {
            mkdirp.sync(path.dirname(this.fullStoreFileName));
            jsonfile.writeFileSync(this.fullStoreFileName, this.state);
        } catch (err) {
            // Don't care
        }
    }
}

stateChangeHandler() {
    // Handles both 'resize' and 'move'
    clearTimeout(this.stateChangeTimer);
    this.stateChangeTimer = setTimeout(this.updateState, this.eventHandlingDelay);
  }

closeHandler() {
  this.updateState();
}

closedHandler() {
  // Unregister listeners and save state
  this.unmanage();
  this.saveState();
}

manage(win: BrowserWindow) {

    if (!this.state) {
        return;
    }

    if (this.config.maximize && this.state.isMaximized) {
      win.maximize();
    }
    if (this.config.fullScreen && this.state.isFullScreen) {
      win.setFullScreen(true);
    }
    win.on('resize', this.stateChangeHandler);
    win.on('move', this.stateChangeHandler);
    win.on('close', this.closeHandler);
    win.on('closed', this.closedHandler);
    this.winRef = win;
    this.isManage = true;
}

unmanage() {
    if (this.winRef) {
      this.winRef.removeListener('resize', this.stateChangeHandler);
      this.winRef.removeListener('move', this.stateChangeHandler);
      clearTimeout(this.stateChangeTimer);
      this.winRef.removeListener('close', this.closeHandler);
      this.winRef.removeListener('closed', this.closedHandler);

      this.isManage = false;
    }
}
}