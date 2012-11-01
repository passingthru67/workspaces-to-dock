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

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const ViewSelector = imports.ui.viewSelector;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;
const Overview = imports.ui.overview;

const Me = imports.ui.extensionSystem.extensions["workspaces-to-dock@passingthru67.gmail.com"];
const Convenience = Me.convenience;

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


// Settings backported for GS 3.2 .. settings also need to be adjusted in dockedWorkspaces.js
const ANIMATION_TIME = Overview.ANIMATION_TIME; // show/hide transition time
const INTELLIHIDE = true; //Enable or disable intellihide mode
const INTELLIHIDE_PERAPP = false; //Application based intellihide
const DOCK_FIXED = false; //Dock is always visible
// End Settings -----------------------------------------------------------------------------


/*
 * A rough and ugly implementation of the intellihide behaviour.
 * Intallihide object: call show()/hide() function based on the overlap with the
 * the target actor object;
 * 
 * Target object has to contain a Clutter.ActorBox object named staticBox and 
 * emit a 'box-changed' signal when this changes.
 * 
*/

let intellihide = function(target) {
    this._init(target);
}

intellihide.prototype = {

    _init: function(target) {
		// temporarily disable intellihide until initialized (prevents connected signals from trying to update dock visibility)
		this._disableIntellihide = true;
		if (_DEBUG_) global.log("intellihide: init - disaableIntellihide");
		
		// Override Gnome Shell functions
		this._overrideGnomeShellFunctions();
		
        this._signalHandler = new Convenience.globalSignalHandler();
        this._tracker = Shell.WindowTracker.get_default();
        this._topWindow = null;
        this._focusApp = null;

        // initial intellihide status is null
        this.status = null;

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
                Lang.bind(this, this._onDockSettingsChanged)
            ],
            // Add signals on windows created from now on
            [
                global.display,
                'window-created',
                Lang.bind(this, this._windowCreated)
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
            // update when monitor changes, for instance in multimonitor when monitors are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._onMonitorsChanged)
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
            ],
            [
                Main.panel._menus,
                'menu-added',
                Lang.bind(this, this._onPanelMenuAdded)
            ]
        );

        // Detect gnome panel popup menus
        for (let i = 0; i < Main.panel._menus._menus.length; i++) {
            this._signalHandler.push([Main.panel._menus._menus[i].menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
        }
        
        // Detect viewSelector Tab signals in overview mode
        for (let i = 0; i < Main.overview._viewSelector._tabs.length; i++) {
            this._signalHandler.push([Main.overview._viewSelector._tabs[i], 'activated', Lang.bind(this, this._overviewTabChanged)]);
        }
        
        // Detect Search started and cancelled
        this._signalHandler.push([Main.overview._viewSelector._searchTab, 'activated', Lang.bind(this, this._searchStarted)]);
        this._signalHandler.push([Main.overview._viewSelector._searchTab, 'search-cancelled', Lang.bind(this, this._searchCancelled)]);

        // Add signals to current windows
        this._initializeAllWindowSignals();

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

        // Clear signals on existing windows 
        global.get_window_actors().forEach(Lang.bind(this,function(wa) { 
            var the_window = wa.get_meta_window();
            this._removeWindowSignals(the_window);
         }));

        if (this._windowChangedTimeout > 0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

		this._restoreGnomeShellFunctions();
    },

    // main function called during init to override gnome shell 3.4/3.6/#
    _overrideGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _overrideGnomeShellFunctions");
        this._overrideGnomeShell34Functions();
    },

    // main function called during destroy to restore gnome shell 3.4/3.6/#
    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _restoreGnomeShellFunctions");
        this._restoreGnomeShell34Functions();
    },
    
    // gnome shell 3.4 function overrides
    _overrideGnomeShell34Functions: function() {
        // Override the PopupMenuManager addMenu function to emit a signal when new menus are added
		// Copied from Gnome Shell .. emit 'menu-added' added
        let p = PopupMenu.PopupMenuManager.prototype;
        this.saved_PopupMenuManager_addMenu = p.addMenu;
        p.addMenu = function(menu, position) {
            let menudata = {
                menu:              menu,
                openStateChangeId: menu.connect('open-state-changed', Lang.bind(this, this._onMenuOpenState)),
                childMenuAddedId:  menu.connect('child-menu-added', Lang.bind(this, this._onChildMenuAdded)),
                childMenuRemovedId: menu.connect('child-menu-removed', Lang.bind(this, this._onChildMenuRemoved)),
                destroyId:         menu.connect('destroy', Lang.bind(this, this._onMenuDestroy)),
                enterId:           0,
                focusInId:         0
            };

            let source = menu.sourceActor;
            if (source) {
                menudata.enterId = source.connect('enter-event', Lang.bind(this, function() { this._onMenuSourceEnter(menu); }));
                menudata.focusInId = source.connect('key-focus-in', Lang.bind(this, function() { this._onMenuSourceEnter(menu); }));
            }

            if (position == undefined)
                this._menus.push(menudata);
            else
                this._menus.splice(position, 0, menudata);
            
            this.emit("menu-added", menu);
        };
        Signals.addSignalMethods(PopupMenu.PopupMenuManager.prototype);
    },
    
    // gnome shell 3.4 function restores
	_restoreGnomeShell34Functions: function() {
        // Restore normal PopupMenuManager addMenu function
        let p = PopupMenu.PopupMenuManager.prototype;
        p.addMenu = this.saved_PopupMenuManager_addMenu;
    },
    
    // handler for when dock size-position is changed
	_onDockSettingsChanged: function() {
		if (_DEBUG_) global.log("intellihide: _onDockSettingsChanged");
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
		this._updateDockVisibility();
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

    // handler for when Gnome Shell 3.4 overview tab is changed
    // for example, when Applications button is clicked the workspaces dock is hidden
    // or when search is started the workspaces dock is hidden
    _overviewTabChanged: function(source, page) {
        if (_DEBUG_) global.log("intellihide: _overviewTabChanged");
        if (Main.overview._viewSelector._activeTab.id == "windows") {
            this._show();
        } else {
            this._hide();
        }
    },

    // handler for when Gnome Shell 3.4 search started
    _searchStarted: function() {
      if (_DEBUG_) global.log("intellihide: _searchStarted");
      this._hide();
    },

    // handler for when Gnome Shell 3.4 search cancelled
    _searchCancelled: function() {
        if (_DEBUG_) global.log("intellihide: _searchCancelled");
        if (Main.overview._viewSelector._activeTab.id == "windows") {
            this._show();
        } else {
            this._hide();
        }
    },

    // handler for when messageTray focus is grabbed
    _onTrayFocusGrabbed: function(source, event) {
        let focusedActor = source.actor;
		let [rx, ry] = focusedActor.get_transformed_position();
        let [rwidth, rheight] = focusedActor.get_size();
        let test = (rx < this._target.staticBox.x2) && (rx + rwidth > this._target.staticBox.x1) && (ry - rheight < this._target.staticBox.y2) && (ry > this._target.staticBox.y1);
        if (_DEBUG_) global.log("intellihide: onTrayFocusGrabbed actor = "+focusedActor+"  position = "+focusedActor.get_transformed_position()+" size = "+focusedActor.get_size()+" test = "+test);
        if (test) {
            this._disableIntellihide = true;
            this._hide();
        }
    },

    // handler for when messageTray focus is ungrabbed
    _onTrayFocusUngrabbed: function(source, event) {
        if (_DEBUG_) global.log("intellihide: onTrayFocusUnGrabbed");
        this._disableIntellihide = false;
        if (this._inOverview) {
            if (Main.overview._viewSelector._activeTab.id == "windows") this._show();
        } else {
            this._updateDockVisibility();
        }
    },

    // handler for when panel menu state is changed
    _onPanelMenuStateChange: function(menu, open) {
        if (open) {
            if (_DEBUG_) global.log("intellihide: _onPanelMenuStateChange - open");
            let [rx, ry] = menu.actor.get_transformed_position();
            let [rwidth, rheight] = menu.actor.get_size();
            let test = (rx < this._target.staticBox.x2) && (rx + rwidth > this._target.staticBox.x1) && (ry < this._target.staticBox.y2) && (ry + rheight > this._target.staticBox.y1);
            if (test) {
                this._disableIntellihide = true;
                this._hide();
            }
        } else {
            if (_DEBUG_) global.log("intellihide: _onPanelMenuStateChange - closed");
            this._disableIntellihide = false;
            if (this._inOverview) {
                if (Main.overview._viewSelector._activeTab.id == "windows") this._show();
            } else {
                this._updateDockVisibility();
            }
        }
    },

    // handler for when panel menu is added
    _onPanelMenuAdded: function(source, menu) {
        if (_DEBUG_) global.log("intellihide: _onPanelMenuAdded");
        // We need to connect signals for new panel menus added after initialization
        this._signalHandler.push([menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
    },

    // handler for when workspace is switched
    _switchWorkspace: function(shellwm, from, to, direction) {
		if (_DEBUG_) global.log("intellihide: _switchWorkspace");
        this._updateDockVisibility();
    },

    // intellihide function to show dock
    _show: function() {
        if (this.status == null || this.status == false) {
            if (DOCK_FIXED) {
                if (_DEBUG_) global.log("intellihide: _show - fadeInDock");
				if (this.status == null) {
                    // do slow fade in when first showing dock
                    this._target.fadeInDock(ANIMATION_TIME, 0);
                } else {
                    // do a quick fade in afterward .. don't know why but slow animation sometimes leaves the fixed dock barely visible
                    this._target.fadeInDock(.05, 0);
                }
            } else {
				if (_DEBUG_) global.log("intellihide: _show - disableAutoHide");
				this._target.disableAutoHide();
            }
            this.status = true;
		}
    },

    // intellihide function to hide dock
    _hide: function(nonreactive) {
        if (this.status == null || this.status == true) {
            this.status = false;
            if (DOCK_FIXED) {
                if (_DEBUG_) global.log("intellihide: _hide - fadeOutDock");
                if (nonreactive) {
                    // hide and make stage nonreactive so meta popup windows receive hover and clicks
                    this._target.fadeOutDock(ANIMATION_TIME, 0, true);
                } else {
                    this._target.fadeOutDock(ANIMATION_TIME, 0, false);
                }
            } else {
				if (_DEBUG_) global.log("intellihide: _hide - enableAutoHide");
                this._target.enableAutoHide();
            }
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
            if (INTELLIHIDE || DOCK_FIXED) {
                if (_DEBUG_) global.log("intellihide: updateDockVisibility - normal mode");
                let overlaps = false;
                let windows = global.get_window_actors();

                if (windows.length > 0) {
                    // This is the window on top of all others in the current workspace
                    this._topWindow = windows[windows.length-1].get_meta_window();

                    // If there isn't a focused app, use that of the window on top
                    this._focusApp = this._tracker.focus_app || this._tracker.get_window_app(this._topWindow);

                    windows = windows.filter(this._intellihideFilterInteresting, this);
                
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
                }
                
                if (_DEBUG_) global.log("intellihide: updateDockVisiblity - overlaps = "+overlaps);
                if (overlaps) {
                    this._hide(true); // hide and make stage nonreactive so meta popup windows receive hover and clicks
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

        // intellihide-perapp -- only dodges windows of same application
        if (INTELLIHIDE_PERAPP) {
            if (this._topWindow && this._focusApp) {
                // Ignore if not top window and not focused app
                let metaWindowApp = this._tracker.get_window_app(meta_win);
                if (this._topWindow != meta_win && this._focusApp != metaWindowApp) {
                    // Special consideration for half maximized windows, useful if one is using two apps side by side
                    //if (!(meta_win.maximized_vertically && !meta_win.maximized_horizontally))
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
    _handledWindowType: function(metaWindow) {
        var wtype = metaWindow.get_window_type();
        if (!DOCK_FIXED) {
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
    },

    _windowCreated: function(__unused_display, the_window) {
        if(INTELLIHIDE)
            this._addWindowSignals(the_window);

    },

    _addWindowSignals: function(the_window) {
            
            // Looking for a way to avoid to add custom variables ...
            the_window._workspacestodock_onPositionChanged = the_window.get_compositor_private().connect(
                'position-changed', Lang.bind(this, this._updateDockVisibility)
            );

            the_window._workspacestodock_onSizeChanged = the_window.get_compositor_private().connect(
                'size-changed', Lang.bind(this, this._updateDockVisibility)
            );

    },

    _removeWindowSignals: function(the_window) {
        
        var wa = the_window.get_compositor_private();

        if( the_window && the_window._workspacestodock_onSizeChanged ) {
               wa.disconnect(the_window._workspacestodock_onSizeChanged);
               delete the_window._workspacestodock_onSizeChanged;
        }

        if( the_window && the_window._workspacestodock_onPositionChanged ) {
               wa.disconnect(the_window._workspacestodock_onPositionChanged);
               delete the_window._workspacestodock_onPositionChanged;

        }
    },

    _initializeAllWindowSignals: function () {
        global.get_window_actors().forEach(Lang.bind(this,function(wa) {
            var meta_win = wa.get_meta_window();
            if (!meta_win) {    //TODO michele: why? What does it mean?
                return;
            } 
            // First remove signals if already present. It should never happen 
            // if the extension is correctly unloaded.
            this._removeWindowSignals(meta_win);
            this._addWindowSignals(meta_win);
        }));
    }

};
