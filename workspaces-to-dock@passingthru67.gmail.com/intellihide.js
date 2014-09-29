/* ========================================================================================================
 * intellihide.js - intellihide functions
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const _DEBUG_ = false;

const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const Signals = imports.signals;
const Shell = imports.gi.Shell;
const Gdk = imports.gi.Gdk;

const Main = imports.ui.main;
const GrabHelper = imports.ui.grabHelper;
const Config = imports.misc.config;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const handledWindowTypes = [
    Meta.WindowType.NORMAL,
    // Meta.WindowType.DESKTOP,    // skip nautilus dekstop window
    // Meta.WindowType.DOCK,       // skip other docks
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN
];

const handledWindowTypes2 = [
    Meta.WindowType.POPUP_MENU,
    Meta.WindowType.DROPDOWN_MENU,
    Meta.WindowType.TOOLTIP
];

const IntellihideMode = {
    HIDE: 0,        // Workspaces is always invisible
    SHOW: 1,        // Workspaces is always visible
    AUTOHIDE: 2,    // Basic autohide mode: visible on mouse hover
    INTELLIHIDE: 3  // Basic intellihide mode: visible if no window overlap the workspaces
};

const OVERVIEW_MODE = IntellihideMode.SHOW;

let GSFunctions = {};


/*
 * A rough and ugly implementation of the intellihide behaviour.
 * Intellihide object: call show()/hide() function based on the overlap with the
 * the dock staticBox object;
 *
 * Dock object has to contain a Clutter.ActorBox object named staticBox and
 * emit a 'box-changed' signal when this changes.
 *
*/

const Intellihide = new Lang.Class({
    Name: 'workspacesToDock.intellihide',

    _init: function(dock) {
        this._gsCurrentVersion = Config.PACKAGE_VERSION.split('.');
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._signalHandler = new Convenience.globalSignalHandler();

        // Dock object
        this._dock = dock;

        // temporarily disable intellihide until initialized (prevents connected signals from trying to update dock visibility)
        this._disableIntellihide = true;
        if (_DEBUG_) global.log("intellihide: init - disaableIntellihide");

        // Override Gnome Shell functions
        this._overrideGnomeShellFunctions();

        // Load settings
        this._bindSettingsChanges();

        this._tracker = Shell.WindowTracker.get_default();
        this._topWindow = null;
        this._focusedWin = null;

        // initial intellihide status is null
        this.status = null;

        // Keep track of the current overview mode (I mean if it is on/off)
        this._inOverview = false;

        // Flag set when overview mode is toggled by window drag event
        this._toggledOverviewOnDrag = false;

        // Main id of the timeout controlling timeout for updateDockVisibility function
        // when windows are dragged around (move and resize)
        this._windowChangedTimeout = 0;

        // Connect global signals
        this._signalHandler.push(
            // call updateVisibility when dock actor changes
            [
                this._dock,
                'box-changed',
                Lang.bind(this, this._onDockSettingsChanged)
            ],
            // Add timeout when window grab-operation begins and remove it when it ends.
            // These signals only exist starting from Gnome-Shell 3.4
            [
                global.display,
                'grab-op-begin',
                Lang.bind(this, this._grabOpBegin)
            ],
            [
                global.display,
                'grab-op-end',
                Lang.bind(this, this._grabOpEnd)
            ],
            // direct maximize/unmazimize are not included in grab-operations
            [
                global.window_manager,
                'maximize',
                Lang.bind(this, this._onWindowMaximized)
            ],
            [
                global.window_manager,
                'unmaximize',
                Lang.bind(this, this._onWindowUnmaximized )
            ],
            // Probably this is also included in restacked?
            [
                global.window_manager,
                'switch-workspace',
                Lang.bind(this, this._switchWorkspace)
            ],
            // trigggered for instance when a window is closed.
            [
                global.screen,
                'restacked',
                Lang.bind(this, this._onScreenRestacked)
            ],
            // Set visibility in overview mode
            [
                Main.overview,
                'showing',
                Lang.bind(this, this._overviewEnter)
            ],
            [
                Main.overview,
                'hiding',
                Lang.bind(this,this._overviewExit)
            ],
            // window-drag-events emitted from workspaces thumbnail window dragging action
            [
                Main.overview,
                'window-drag-begin',
                Lang.bind(this,this._onWindowDragBegin)
            ],
            [
                Main.overview,
                'window-drag-cancelled',
                Lang.bind(this,this._onWindowDragCancelled)
            ],
            [
                Main.overview,
                'window-drag-end',
                Lang.bind(this,this._onWindowDragEnd)
            ],
            // item-drag-events emitted from app display icon dragging action
            [
                Main.overview,
                'item-drag-begin',
                Lang.bind(this,this._onItemDragBegin)
            ],
            [
                Main.overview,
                'item-drag-cancelled',
                Lang.bind(this,this._onItemDragCancelled)
            ],
            [
                Main.overview,
                'item-drag-end',
                Lang.bind(this,this._onItemDragEnd)
            ],
            // update when monitor changes, for instance in multimonitor when monitors are attached
            [
                Main.layoutManager,
                'monitors-changed',
                Lang.bind(this, this._onMonitorsChanged)
            ],
            [
                Main.messageTray._grabHelper,
                'focus-grabbed',
                Lang.bind(this, this._onTrayFocusGrabbed)
            ],
            [
                Main.messageTray._grabHelper,
                'focus-ungrabbed',
                Lang.bind(this, this._onTrayFocusUngrabbed)
            ],
            [
                Main.panel.menuManager._grabHelper,
                'focus-grabbed',
                Lang.bind(this, this._onPanelFocusGrabbed)
            ],
            [
                Main.panel.menuManager._grabHelper,
                'focus-ungrabbed',
                Lang.bind(this, this._onPanelFocusUngrabbed)
            ],
            [
                Main.overview.viewSelector,
                'page-changed',
                Lang.bind(this, this._overviewPageChanged)
            ]
        );

        // if background manager valid, Connect grabHelper signals
        let primaryIndex = Main.layoutManager.primaryIndex;
        if (Main.layoutManager._bgManagers[primaryIndex]) {
            this._signalHandler.pushWithLabel(
                'bgManagerSignals',
                [
                    Main.layoutManager._bgManagers[primaryIndex].backgroundActor._backgroundManager._grabHelper,
                    'focus-grabbed',
                    Lang.bind(this, this._onPanelFocusGrabbed)
                ],
                [
                    Main.layoutManager._bgManagers[primaryIndex].backgroundActor._backgroundManager._grabHelper,
                    'focus-ungrabbed',
                    Lang.bind(this, this._onPanelFocusUngrabbed)
                ]
            );
        }
        if (_DEBUG_) global.log("intellihide: init - signals being captured");

        // Start main loop and bind initialize function
        Mainloop.idle_add(Lang.bind(this, this._initialize));
    },

    _initialize: function() {
        if (_DEBUG_) global.log("intellihide: initializing");
        // enable intellihide now
        this._disableIntellihide = false;
        if (_DEBUG_) global.log("intellihide: initialize - turn on intellihide");

        // updte dock visibility
        this._updateDockVisibility();
    },

    destroy: function() {
        if (_DEBUG_) global.log("intellihide: destroying");
        // Disconnect global signals
        this._signalHandler.disconnect();

        // Disconnect GSettings signals
        this._settings.run_dispose();

        if (this._windowChangedTimeout > 0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

        this._restoreGnomeShellFunctions();
    },

    // Called during init to override/extend gnome shell functions
    _overrideGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _overrideGnomeShellFunctions");
        // Extend the GrabHelper grab function to emit a signal when focus is grabbed
        GSFunctions['GrabHelper_grab'] = GrabHelper.GrabHelper.prototype.grab;
        GrabHelper.GrabHelper.prototype.grab = function(params) {
            let ret = GSFunctions['GrabHelper_grab'].call(this, params);
            if (ret)
                this.emit('focus-grabbed');
            return ret;
        };
        // Extend the GrabHelper ungrab function to emit a signal when focus is ungrabbed
        GSFunctions['GrabHelper_ungrab'] = GrabHelper.GrabHelper.prototype.ungrab;
        GrabHelper.GrabHelper.prototype.ungrab = function(params) {
            let ret = GSFunctions['GrabHelper_ungrab'].call(this, params);
            this.emit('focus-ungrabbed');
            return ret;
        };
        Signals.addSignalMethods(GrabHelper.GrabHelper.prototype);
    },

    // main function called during destroy to restore gnome shell functions
    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _restoreGnomeShellFunctions");
        // Restore normal GrabHelper grab function
        GrabHelper.GrabHelper.prototype.grab = GSFunctions['GrabHelper_grab'];
        // Restore normal GrabHelper ungrab function
        GrabHelper.GrabHelper.prototype.ungrab = GSFunctions['GrabHelper_ungrab'];
    },

    // handler to bind settings when preferences changed
    _bindSettingsChanges: function() {
        this._settings.connect('changed::intellihide', Lang.bind(this, function() {
            if (_DEBUG_) global.log("intellihide: _bindSettingsChanges for intellihide");
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::intellihide-option', Lang.bind(this, function(){
            if (_DEBUG_) global.log("intellihide: _bindSettingsChanges for intellihide-option");
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function() {
            if (_DEBUG_) global.log("intellihide: _bindSettingsChanges for dock-fixed");
            if (this._settings.get_boolean('dock-fixed')) {
                this.status = true; // Since the dock is now shown
            } else {
                // Wait that windows rearrange after struts change
                Mainloop.idle_add(Lang.bind(this, function() {
                    this._updateDockVisibility();
                    return false;
                }));
            }
        }));
    },

    // handler for when dock size-position is changed
    _onDockSettingsChanged: function() {
        if (_DEBUG_) global.log("intellihide: _onDockSettingsChanged");
        this._updateDockVisibility();
    },

    // handler for when window is maximized
    _onWindowMaximized: function() {
        if (_DEBUG_) global.log("intellihide: _onWindowMaximized");
        this._updateDockVisibility();
    },

    // handler for when window is unmaximized
    _onWindowUnmaximized: function() {
        if (_DEBUG_) global.log("intellihide: _onWindowUnmaximized");
        this._updateDockVisibility();
    },

    // handler for when screen is restacked
    _onScreenRestacked: function() {
        if (_DEBUG_) global.log("intellihide: _onScreenRestacked");
        this._updateDockVisibility();
    },

    // handler for when monitor changes
    _onMonitorsChanged: function() {
        if (_DEBUG_) global.log("intellihide: _onMonitorsChanged");
        // disconnect bgManager signals
        this._signalHandler.disconnectWithLabel('bgManagerSignals');

        // if background manager valid, Connect grabHelper signals
        let primaryIndex = Main.layoutManager.primaryIndex;
        if (Main.layoutManager._bgManagers[primaryIndex]) {
            this._signalHandler.pushWithLabel(
                'bgManagerSignals',
                [
                    Main.layoutManager._bgManagers[primaryIndex].background.actor._backgroundManager._grabHelper,
                    'focus-grabbed',
                    Lang.bind(this, this._onPanelFocusGrabbed)
                ],
                [
                    Main.layoutManager._bgManagers[primaryIndex].background.actor._backgroundManager._grabHelper,
                    'focus-ungrabbed',
                    Lang.bind(this, this._onPanelFocusUngrabbed)
                ]
            );
        }

        this._updateDockVisibility();
    },

    // handler for when thumbnail windows dragging started
    _onWindowDragBegin: function() {
        if (_DEBUG_) global.log("intellihide: _onWindowDragBegin");
        Main.overview.show();
    },

    // handler for when thumbnail windows dragging cancelled
    _onWindowDragCancelled: function() {
        if (_DEBUG_) global.log("intellihide: _onWindowDragCancelled");
    },

    // handler for when thumbnail windows dragging ended
    _onWindowDragEnd: function() {
        if (_DEBUG_) global.log("intellihide: _onWindowDragEnd");
    },

    // handler for when app icon dragging started
    _onItemDragBegin: function() {
        if (_DEBUG_) global.log("intellihide: _onItemDragBegin");
        Main.overview.show();
        this._toggledOverviewOnDrag = true;
        this._show();
    },

    // handler for when app icon dragging cancelled
    _onItemDragCancelled: function() {
        if (_DEBUG_) global.log("intellihide: _onItemDragCancelled");
        if (this._toggledOverviewOnDrag) {
            this._toggledOverviewOnDrag = false;

            // Should we hide the dock?
            // GS38+ remains in same overview mode, therefore we need to detect mode to determine if we should hide dock.
            if (this._inOverview) {
                if (Main.overview.viewSelector._activePage != Main.overview.viewSelector._workspacesPage)
                    this._hide();
            }
        }
    },

    // handler for when app icon dragging ended
    _onItemDragEnd: function() {
        if (_DEBUG_) global.log("intellihide: _onWindowDragEnd");
        if (this._toggledOverviewOnDrag) {
            this._toggledOverviewOnDrag = false;

            // Should we hide the dock?
            // GS38+ remains in same overview mode, therefore we need to detect mode to determine if we should hide dock.
            if (this._inOverview) {
                if (Main.overview.viewSelector._activePage != Main.overview.viewSelector._workspacesPage)
                    this._hide();
            }
        }
    },

    // handler for when overview mode exited
    _overviewExit: function() {
        if (_DEBUG_) global.log("intellihide: _overviewExit");
        this._inOverview = false;
        this._updateDockVisibility();
    },

    // handler for when overview mode entered
    _overviewEnter: function() {
        if (_DEBUG_) global.log("intellihide: _overviewEnter");
        this._inOverview = true;
        if (OVERVIEW_MODE == IntellihideMode.SHOW) {
            this._show();
        } else if (OVERVIEW_MODE == IntellihideMode.AUTOHIDE) {
            this._hide();
        } else if (OVERVIEW_MODE == IntellihideMode.INTELLIHIDE) {
            this._show();
        } else if (OVERVIEW_MODE == IntellihideMode.HIDE) {
            /*TODO*/
        }
    },

    // handler for when Gnome Shell 3.6+ overview page is changed (GS36+)
    // for example, when Applications button is clicked the workspaces dock is hidden
    // or when search is started the workspaces dock is hidden
    _overviewPageChanged: function(source, page) {
        if (_DEBUG_) global.log("intellihide: _overviewPageChanged");
        let newPage;
        if (page)
            newPage = page;
        else
            newPage = Main.overview.viewSelector._activePage;

        if (this._inOverview) {
            if (newPage == Main.overview.viewSelector._workspacesPage) {
                this._show();
            } else {
                this._hide();
            }
        }
    },

    // handler for when panel focus is grabbed (GS 38+)
    _onPanelFocusGrabbed: function(source, event) {
        if (this._settings.get_boolean('ignore-top-panel')) return;
        let idx = source._grabStack.length - 1;
        let focusedActor = source._grabStack[idx].actor;
        let [rx, ry] = focusedActor.get_transformed_position();
        let [rwidth, rheight] = focusedActor.get_size();
        let test = (rx < this._dock.staticBox.x2) && (rx + rwidth > this._dock.staticBox.x1) && (ry < this._dock.staticBox.y2) && (ry + rheight > this._dock.staticBox.y1);
        if (_DEBUG_) global.log("intellihide: onPanelFocusGrabbed actor = "+focusedActor+"  position = "+focusedActor.get_transformed_position()+" size = "+focusedActor.get_size()+" test = "+test);
        if (test) {
            this._disableIntellihide = true;
            this._hide();
        }
    },

    // handler for when panel focus is ungrabbed (GS 38+)
    _onPanelFocusUngrabbed: function(source, event) {
        if (this._settings.get_boolean('ignore-top-panel')) return;
        if (_DEBUG_) global.log("intellihide: onPanelFocusUnGrabbed");
        this._disableIntellihide = false;
        if (this._inOverview) {
            if (Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage)
                this._show();
        } else {
            this._updateDockVisibility();
        }
    },

    // handler for when messageTray focus is grabbed (GS 34+)
    _onTrayFocusGrabbed: function(source, event) {
        if (this._settings.get_boolean('ignore-message-tray')) return;
        if (_DEBUG_) global.log("intellihide: _onTrayFocusGrabbed");
        let idx = source._grabStack.length - 1;
        let focusedActor = source._grabStack[idx].actor;
        if (focusedActor.get_name() == "message-tray") {
            let [rx, ry] = focusedActor.get_transformed_position();
            let [rwidth, rheight] = focusedActor.get_size();
            let test = (ry - rheight < this._dock.staticBox.y2) && (ry > this._dock.staticBox.y1);
            if (test) {
                this._disableIntellihide = true;
                this._hide();
            }
            return;
        }
        let [rx, ry] = focusedActor.get_transformed_position();
        let [rwidth, rheight] = focusedActor.get_size();
        let test = (rx < this._dock.staticBox.x2) && (rx + rwidth > this._dock.staticBox.x1) && (ry - rheight < this._dock.staticBox.y2) && (ry > this._dock.staticBox.y1);
        if (_DEBUG_) global.log("intellihide: onTrayFocusGrabbed actor = "+focusedActor+"  position = "+focusedActor.get_transformed_position()+" size = "+focusedActor.get_size()+" test = "+test);
        if (test) {
            this._disableIntellihide = true;
            this._hide();
        }
    },

    // handler for when messageTray focus is ungrabbed (GS 34+)
    _onTrayFocusUngrabbed: function(source, event) {
        if (this._settings.get_boolean('ignore-message-tray')) return;
        if (_DEBUG_) global.log("intellihide: onTrayFocusUnGrabbed");
        this._disableIntellihide = false;
        if (this._inOverview) {
            if (Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage)
                this._show();
        } else {
            this._updateDockVisibility();
        }
    },

    // handler for when window move begins
    _grabOpBegin: function() {
        if (_DEBUG_) global.log("intellihide: _grabOpBegin");
        if (this._settings.get_boolean('intellihide')) {
            let INTERVAL = 100; // A good compromise between reactivity and efficiency; to be tuned.

            if (this._windowChangedTimeout > 0)
                Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

            this._windowChangedTimeout = Mainloop.timeout_add(INTERVAL,
                Lang.bind(this, function() {
                    this._updateDockVisibility();
                    return true; // to make the loop continue
                })
            );
        }
    },

    // handler for when window move ends
    _grabOpEnd: function() {
        if (_DEBUG_) global.log("intellihide: _grabOpEnd");
        if (this._settings.get_boolean('intellihide')) {
            if (this._windowChangedTimeout > 0)
                Mainloop.source_remove(this._windowChangedTimeout);

            this._windowChangedTimeout = 0
            this._updateDockVisibility();
        }
    },

    // handler for when workspace is switched
    _switchWorkspace: function(shellwm, from, to, direction) {
        if (_DEBUG_) global.log("intellihide: _switchWorkspace");
        this._updateDockVisibility();
    },

    // intellihide function to show dock
    _show: function() {
        if (this._settings.get_boolean('dock-fixed')) {
            if (_DEBUG_) global.log("intellihide: _show - fadeInDock");
            this._dock.fadeInDock(0, 0);
        } else {
            if (_DEBUG_) global.log("intellihide: _show - disableAutoHide");
            this._dock.disableAutoHide();
        }
        this.status = true;
    },

    // intellihide function to hide dock
    _hide: function(metaOverlap) {
        this.status = false;
        if (this._settings.get_boolean('dock-fixed')) {
            if (_DEBUG_) global.log("intellihide: _hide - fadeOutDock");
            if (metaOverlap) {
                // meta popup overlap initiated this hide
                this._dock.fadeOutDock(0, 0, true);
            } else {
                // toppanel or messagetray or overview change initiated this hide
                this._dock.fadeOutDock(0, 0, false);
            }
        } else {
            if (_DEBUG_) global.log("intellihide: _hide - enableAutoHide");
            this._dock.enableAutoHide();
        }
    },

    // intellihide function to determine if dock overlaps a window
    _updateDockVisibility: function() {
        if (this._disableIntellihide)
            return;

        // If we are in overview mode and the dock is set to be visible prevent
        // it to be hidden by window events(window create, workspace change,
        // window close...)
        if (this._inOverview) {
            if (OVERVIEW_MODE !== IntellihideMode.INTELLIHIDE) {
                return;
            }
        }

        //else in normal mode:
        else {
            if (this._settings.get_boolean('intellihide') || this._settings.get_boolean('dock-fixed')) {
                if (_DEBUG_) global.log("intellihide: updateDockVisibility - normal mode");
                let overlaps = false;
                let windows = global.get_window_actors();

                if (windows.length > 0) {

                    // SANITY CHECK
                    //global.log("===============================================================");
                    //for (let i = windows.length-1; i >= 0; i--) {
                        //let win = windows[i].get_meta_window();
                        //let wclass = win.get_wm_class();
                        //let wtype = win.get_window_type();
                        //let wfocus = win.has_focus();
                        //let wapp = this._tracker.get_window_app(win);
                        //let msg = wclass + " [" + wtype + "] focused? " + wfocus + " wintype? " + wtype + " app? " + wapp;
                        //global.log(msg);
                    //}
                    //global.log("---------------------------------------------------------------");

                    // This is the default window on top of all others
                    this._topWindow = windows[windows.length-1].get_meta_window();

                    // Find focused window (not always top window)
                    for (let i = windows.length-1; i >= 0; i--) {
                        let win = windows[i].get_meta_window();
                        if (win.has_focus()) {
                            this._focusedWin = win;
                            break;
                        }
                    }

                    // If there isn't a focused app, use that of the window on top
                    //this._focusApp = this._tracker.focus_app || this._tracker.get_window_app(this._topWindow);

                    windows = windows.filter(this._intellihideFilterInteresting, this);

                    for (let i = 0; i < windows.length; i++) {
                        let win = windows[i].get_meta_window();
                        if (win) {
                            let rect = win.get_outer_rect();
                            let test = (rect.x < this._dock.staticBox.x2) && (rect.x + rect.width > this._dock.staticBox.x1) && (rect.y < this._dock.staticBox.y2) && (rect.y + rect.height > this._dock.staticBox.y1);
                            if (test) {
                                overlaps = true;
                                break;
                            }
                        }
                    }
                }

                if (_DEBUG_) global.log("intellihide: updateDockVisiblity - overlaps = "+overlaps);
                if (overlaps) {
                    this._hide(true);
                } else {
                    this._show();
                }
            } else {
                this._hide();
            }
        }

    },

    // Filter interesting windows to be considered for intellihide.
    // Consider all windows visible on the current workspace.
    _intellihideFilterInteresting: function(wa, edge) {
        let currentWorkspace = global.screen.get_active_workspace_index();
        let meta_win = wa.get_meta_window();
        if (!meta_win) { //TODO michele: why? What does it mean?
            return false;
        }

        if (!this._handledWindowType(meta_win))
            return false;

        let wksp = meta_win.get_workspace();
        if (!wksp)
            return false;

        let wksp_index = wksp.index();

        // check intellihide-option for windows of focused app
        if (this._settings.get_int('intellihide-option') == 1) {

            // TEST1: ignore if meta_win is a popup window
            if (meta_win.get_window_type() != Meta.WindowType.POPUP_MENU) {
                // TEST2: ignore if meta_win is not same class as the focused window (not same app)
                if (this._focusedWin.get_wm_class() != meta_win.get_wm_class())
                    return false;
            }
        }

        // check intellihide-option for top-level windows of  focused app
        if (this._settings.get_int('intellihide-option') == 2) {

            // TEST1: ignore if meta_win is a popup window
            if (meta_win.get_window_type() != Meta.WindowType.POPUP_MENU) {

                // TEST2: ignore if meta_win is not same class as the focused window (not same app)
                if (this._focusedWin.get_wm_class() != meta_win.get_wm_class())
                    return false;

                // same app .. but is it top-level window?
                // TEST3: ignore if meta_win is not the focused window and both are normal windows
                if (this._focusedWin.get_window_type() == Meta.WindowType.NORMAL) {
                    if (meta_win.get_window_type() == Meta.WindowType.NORMAL) {
                        if (this._focusedWin != meta_win)
                            return false;
                    }
                }

                // TEST4: ignore if meta_win is tooltip but mouse pointer is not over focused window
                if (meta_win.get_window_type() == Meta.WindowType.TOOLTIP) {
                    let pointer = Gdk.Display.get_default().get_device_manager().get_client_pointer();
                    let [scr,x,y] = pointer.get_position();
                    let rect = this._focusedWin.get_outer_rect();
                    let overlap = ((x > rect.x) && (x < rect.x+rect.width) && (y > rect.y) && (y < rect.y+rect.height));
                    if (!overlap)
                        return false;
                }
            }
        }

        if (wksp_index == currentWorkspace && meta_win.showing_on_its_workspace()) {
            return true;
        } else {
            return false;
        }
    },

    // Filter windows by type
    // inspired by Opacify@gnome-shell.localdomain.pl
    _handledWindowType: function(metaWindow, grptype) {
        var wtype = metaWindow.get_window_type();

        if (grptype == null || grptype == 1) {
            if (!this._settings.get_boolean('dock-fixed')) {
                // Test primary window types .. only if dock is not fixed
                for (var i = 0; i < handledWindowTypes.length; i++) {
                    var hwtype = handledWindowTypes[i];
                    if (hwtype == wtype) {
                        return true;
                    }
                }
            }
        }

        if (grptype == null || grptype == 2) {
            // Test secondary window types .. even if dock is fixed
            for (var i = 0; i < handledWindowTypes2.length; i++) {
                var hwtype = handledWindowTypes2[i];
                if (hwtype == wtype) {
                    return true;
                }
            }
        }

        return false;
    }
});
