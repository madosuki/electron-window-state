'use strict';

const path = require('path');
const electron = require('electron');
const jsonfile = require('jsonfile');
const mkdirp = require('mkdirp');

module.exports = function (options) {
  const app = electron.app || electron.remote.app;
  const screen = electron.screen || electron.remote.screen;
  let state;
  let winRef;
  let stateChangeTimer;
  const eventHandlingDelay = 100;
  const config = Object.assign({
    file: 'window-state.json',
    path: app.getPath('userData'),
    maximize: true,
    fullScreen: true
  }, options);
  const fullStoreFileName = path.join(config.path, config.file);

  function isNormal(win) {
    return !win.isMaximized() && !win.isMinimized() && !win.isFullScreen();
  }

  function hasBounds() {
    return state &&
      Number.isInteger(state.x) &&
      Number.isInteger(state.y) &&
      Number.isInteger(state.width) && state.width > 0 &&
      Number.isInteger(state.height) && state.height > 0;
  }

  function resetStateToDefault() {
    const displayBounds = screen.getPrimaryDisplay().bounds;

    // Reset state to default values on the primary display
    state = {
      width: config.defaultWidth || 800,
      height: config.defaultHeight || 600,
      x: undefined,
      y: undefined,
      displayBounds
    };
  }

  function windowWithinBounds(bounds) {
    return (
      state.x >= bounds.x &&
      state.y >= bounds.y &&
      state.x + state.width <= bounds.x + bounds.width &&
      state.y + state.height <= bounds.y + bounds.height
    );
  }


  function resizeAndReplaceWindowForWorkArea(display) {
    if (state.isFullScreen || state.isMaximized) {
      return;
    }

    if (state.width > display.workArea.width) {
      state.width = display.workArea.width;
    }

    if (state.height > display.workArea.height) {
      state.height = display.workArea.height;
    }

    // for left taskbar
    if (state.x < display.workArea.x) {
      state.x = display.workArea.x;
    }

    // for right taskbar
    if (state.x + state.width > display.workArea.width) {
      state.x = display.workArea.x + display.workArea.width - state.width;
    }

    // for top taskbar
    if (state.y < display.bounds.height - display.workArea.height) {
      state.y = display.workArea.y;
    }

    // for bottom taskbar
    if (state.y + state.height > display.workArea.height) {
      state.y = display.workArea.y + display.workArea.height - state.height;
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
    const isValid = state && (hasBounds() || state.isMaximized || state.isFullScreen);
    if (!isValid) {
      state = null;
      return;
    }

    if (hasBounds() && state.displayBounds) {
      ensureWindowVisibleOnSomeDisplay();
    }
  }

  function updateState(win) {
    win = win || winRef;
    if (!win) {
      return;
    }
    // Don't throw an error when window was closed
    try {
      const winBounds = win.getBounds();
      if (isNormal(win)) {
        state.x = winBounds.x;
        state.y = winBounds.y;
        state.width = winBounds.width;
        state.height = winBounds.height;
      }
      state.isMaximized = win.isMaximized();
      state.isFullScreen = win.isFullScreen();
      state.displayBounds = screen.getDisplayMatching(winBounds).bounds;
    } catch (err) {}
  }

  function checkUpdatedStateCompareToReadedData() {
    if (!readedData) {
      return true;
    }

    const checkWhetherHaveUpdatedDisplayBounds = () => {
      if (readedData.displayBounds.x !== state.displayBounds.x ||
          readedData.displayBounds.y !== state.displayBounds.y ||
          readedData.displayBounds.width !== state.displayBounds.width ||
          readedData.displayBounds.height !== state.displayBounds.height) {
            return true;
        }
        return false;
    };
    
    const checkWhetherHaveUpdatedCoordAndSize = () => {
      if (readedData.x !== state.x ||
          readedData.y !== state.y || 
          readedData.width !== state.width ||
          readedData.height !== state.height ||
          readedData.isMaximized !== state.isMaximized ||
          readedData.isFullScreen !== state.isFullScreen) {
            return true;
        }
      
      return false; 
    };
  
    if (checkWhetherHaveUpdatedCoordAndSize() || checkWhetherHaveUpdatedCoordAndSize()) {
      return true;
    }

    return false;
  }

  function saveState(win) {
    // Update window state only if it was provided
    if (win) {
      updateState(win);
    }

    if (!checkUpdatedStateCompareToReadedData()) {
      return;
    }

    // Save state
    try {
      mkdirp.sync(path.dirname(fullStoreFileName));
      jsonfile.writeFileSync(fullStoreFileName, state);
    } catch (err) {
      // Don't care
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

  function manage(win) {
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
  }

  function unmanage() {
    if (winRef) {
      winRef.removeListener('resize', stateChangeHandler);
      winRef.removeListener('move', stateChangeHandler);
      clearTimeout(stateChangeTimer);
      winRef.removeListener('close', closeHandler);
      winRef.removeListener('closed', closedHandler);
      winRef = null;
    }
  }

  let readedData;
  // Load previous state
  try {
    readedData = jsonfile.readFileSync(fullStoreFileName);
    state = readedData;
  } catch (err) {
    // Don't care
  }

  // Check state validity
  validateState();

  // Set state fallback values
  state = Object.assign({
    width: config.defaultWidth || 800,
    height: config.defaultHeight || 600
  }, state);

  return {
    get x() { return state.x; },
    get y() { return state.y; },
    get width() { return state.width; },
    get height() { return state.height; },
    get displayBounds() { return state.displayBounds; },
    get isMaximized() { return state.isMaximized; },
    get isFullScreen() { return state.isFullScreen; },
    saveState,
    unmanage,
    manage,
    resetStateToDefault
  };
};
