/* ========================================================================================================
 * intellihide.js - intellihide functions
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;

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

/*
 * A rough and ugly implementation of the intellihide behaviour.
 * Intallihide object: call show()/hide() function based on the overlap with the
 * the target actor object;
 * 
 * Target object has to contain a Clutter.ActorBox object named staticBox and 
 * emit a 'box-changed' signal when this changes.
 * 
*/

let intellihide = function(show, hide, target, settings) {
    this._init(show, hide, target, settings);
}

intellihide.prototype = {

    _init: function(show, hide, target, settings) {

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalHandler = new Convenience.globalSignalHandler();

        // current intellihide status
        this.status;
        // manually temporary disable intellihide update
        this._disableIntellihide = false;
        // Set base functions
        this.showFunction = show;
        this.hideFunction = hide;
        // Target object
        this._target = target;
        // Keep track of the current overview mode (I mean if it is on/off)
        this._inOverview = false;

        // Main id of the timeout controlling timeout for updateDockVisibility function 
        // when windows are dragged around (move and resize)
        this._windowChangedTimeout = 0;

        // Connect global signals
        this._signalHandler.push(
            // call updateVisibility when target actor changes
            [
                this._target,
                'box-changed',
                Lang.bind(this, this._updateDockVisibility)
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
                Lang.bind(this, this._updateDockVisibility )
            ],
            [
                global.window_manager,
                'unmaximize',
                Lang.bind(this, this._updateDockVisibility )
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
                Lang.bind(this, this._updateDockVisibility)
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
            // update when monitor changes, for instance in multimonitor when monitors are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._updateDockVisibility)
            ],
            [
                Main.messageTray._focusGrabber,
                'focus-grabbed',
                Lang.bind(this, this._onTrayFocusGrabbed)
            ],
            [
                Main.messageTray._focusGrabber,
                'focus-ungrabbed',
                Lang.bind(this, this._onTrayFocusUngrabbed)
            ]
        );

        // Detect viewSelector Tab signals in overview mode
        for (let i = 0; i < Main.overview._viewSelector._tabs.length; i++) {
            this._signalHandler.push([Main.overview._viewSelector._tabs[i], 'activated', Lang.bind(this, this._overviewChanged)]);
        }

        // initialize: call show forcing to initialize status variable
        this._show(true);

        // update visibility
        this._updateDockVisibility();
        
        // Start main loop and bind initialize function
        Mainloop.idle_add(Lang.bind(this, this._initialize));

    },

    _initialize: function() {
        // Detect gnome panel popup menus.  Reason for detection being here instead of during init
        // is because it needs to be done after all the panel extensions have loaded
        for (let i = 0; i < Main.panel._menus._menus.length; i++) {
            this._signalHandler.push([Main.panel._menus._menus[i].menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
        }
    },
    
    destroy: function() {
        // Disconnect global signals
        this._signalHandler.disconnect();

        if (this._windowChangedTimeout > 0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure
    },

    _bindSettingsChanges: function() {
        this._settings.connect('changed::intellihide', Lang.bind(this, function() {
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function() {
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

    _show: function(force) {
        if (this.status == false || force) {
            this.status = true;
            if (this._settings.get_boolean('dock-fixed')) {
                this._target.fadeInDock(this._settings.get_double('animation-time'), 0);
            } else {
                this._target.disableAutoHide();
            }
        }
    },

    _hide: function(force) {
        if (this.status == true || force) {
            this.status = false;
            if (this._settings.get_boolean('dock-fixed')) {
                this._target.fadeOutDock(this._settings.get_double('animation-time'), 0);
            } else {
                this._target.enableAutoHide();
            }
        }
    },

    _overviewExit: function() {
        this._inOverview = false;
        this._updateDockVisibility();

    },

    _overviewEnter: function() {
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

    // This function was added to handle changes in overview mode
    // for example, when Applications tab is clicked the workspaces dock is hidden
    _overviewChanged: function() {
        if (Main.overview._viewSelector._activeTab.id == "windows") {
            this._show();
        } else {
            this._hide();
        }
    },

    _onTrayFocusGrabbed: function(actor, event) {
        let focusedActor = actor.actor;
        let [rx, ry] = focusedActor.get_transformed_position();
        let [rwidth, rheight] = focusedActor.get_size();
        let test = (rx < this._target.staticBox.x2) && (rx + rwidth > this._target.staticBox.x1) && (ry - rheight < this._target.staticBox.y2) && (ry > this._target.staticBox.y1);
        if (test) {
            if (this._settings.get_boolean('dock-fixed')) {
                this._target.fadeOutDock(this._settings.get_double('animation-time'), 0);
            } else {
                this._disableIntellihide = true;
                this._hide();
            }
        }
    },

    _onTrayFocusUngrabbed: function(actor, event) {
        if (this._settings.get_boolean('dock-fixed')) {
            this._target.fadeInDock(this._settings.get_double('animation-time'), 0);
        } else {
            this._disableIntellihide = false;
            if (this._inOverview) {
                if (Main.overview._viewSelector._activeTab.id == "windows") {
                    this._show();
                }
            } else {
                this._updateDockVisibility();
            }
        }
    },

    _onPanelMenuStateChange: function(menu, open) {
        if (open) {
            let [rx, ry] = menu.actor.get_transformed_position();
            let [rwidth, rheight] = menu.actor.get_size();
            let test = (rx < this._target.staticBox.x2) && (rx + rwidth > this._target.staticBox.x1) && (ry < this._target.staticBox.y2) && (ry + rheight > this._target.staticBox.y1);
            if (test) {
                if (this._settings.get_boolean('dock-fixed')) {
                    this._target.fadeOutDock(this._settings.get_double('animation-time'), 0);
                } else {
                    this._hide();
                }
            }
        } else {
            if (this._settings.get_boolean('dock-fixed')) {
                this._target.fadeInDock(this._settings.get_double('animation-time'), 0);
            } else {
                if (this._inOverview) {
                    if (Main.overview._viewSelector._activeTab.id == "windows") {
                        this._show();
                    }
                } else {
                    this._updateDockVisibility();
                }
            }
        }
    },

    _grabOpBegin: function() {
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

    _grabOpEnd: function() {
        if (this._settings.get_boolean('intellihide')) {
            if (this._windowChangedTimeout > 0)
                Mainloop.source_remove(this._windowChangedTimeout);

            this._updateDockVisibility();
        }
    },

    _switchWorkspace: function(shellwm, from, to, direction) {
        this._updateDockVisibility();
    },

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
            if (this._settings.get_boolean('intellihide')) {
                let overlaps = false;
                let windows = global.get_window_actors().filter(this._intellihideFilterInteresting, this);
                for (let i = 0; i < windows.length; i++) {
                    let win = windows[i].get_meta_window();
                    if (win) {
                        let rect = win.get_outer_rect();
                        let test = (rect.x < this._target.staticBox.x2) && (rect.x + rect.width > this._target.staticBox.x1) && (rect.y < this._target.staticBox.y2) && (rect.y + rect.height > this._target.staticBox.y1);
                        if (test) {
                            overlaps = true;
                            break;
                        }
                    }
                }
                if (overlaps) {
                    this._hide();
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
        var currentWorkspace = global.screen.get_active_workspace_index();
        var meta_win = wa.get_meta_window();
        if (!meta_win) { //TODO michele: why? What does it mean?
            return false;
        }

        if (!this._handledWindowType(meta_win))
            return false;

        var wksp = meta_win.get_workspace();
        var wksp_index = wksp.index();

        if (wksp_index == currentWorkspace && meta_win.showing_on_its_workspace()) {
            return true;
        } else {
            return false;
        }
    },

    // Filter windows by type
    // inspired by Opacify@gnome-shell.localdomain.pl
    _handledWindowType: function(metaWindow) {
        var wtype = metaWindow.get_window_type();
        if (!this._settings.get_boolean('dock-fixed')) {
            // Test primary window types .. only if dock is not fixed
            for (var i = 0; i < handledWindowTypes.length; i++) {
                var hwtype = handledWindowTypes[i];
                if (hwtype == wtype) {
                    return true;
                }
            }
        }
        // Test secondary window types .. even if dock is fixed
        for (var i = 0; i < handledWindowTypes2.length; i++) {
            var hwtype = handledWindowTypes2[i];
            if (hwtype == wtype) {
                return true;
            }
        }
        
        return false;
    }

};
