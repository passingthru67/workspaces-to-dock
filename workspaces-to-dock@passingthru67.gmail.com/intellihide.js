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
const PopupMenu = imports.ui.popupMenu;
let GrabHelper = null; // Gnome Shell 3.4 doesn't have a grabhelper

const ViewSelector = imports.ui.viewSelector;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;

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

let intellihide = function(target, settings, gsCurrentVersion) {
    this._gsCurrentVersion = gsCurrentVersion;
    
    // define gnome shell 3.6 grabHelper
    if (this._gsCurrentVersion[1] == "6")
        GrabHelper = imports.ui.grabHelper;
        
    this._init(target, settings);
}

intellihide.prototype = {

    _init: function(target, settings) {
		// temporarily disable intellihide until initialized (prevents connected signals from trying to update dock visibility)
		this._disableIntellihide = true;
		if (_DEBUG_) global.log("intellihide: init - disaableIntellihide");
		
		// Override Gnome Shell functions
		this._overrideGnomeShellFunctions();
		
        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalHandler = new Convenience.globalSignalHandler();
        this._tracker = Shell.WindowTracker.get_default();
        this._topWindow = null;
        this._focusedWin = null;

        // initial intellihide status is null
        this.status = null;

        // Target object
        this._target = target;
        // Keep track of the current overview mode (I mean if it is on/off)
        this._inOverview = false;
        
        // Flag set when overview mode is toggled by window drag event
        this._toggledOverviewOnDrag = false;

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
            // update when monitor changes, for instance in multimonitor when monitors are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._onMonitorsChanged)
            ]
        );

        // Connect global signals based on gnome shell version
        switch (this._gsCurrentVersion[1]) {
            case"4":
                // Gnome Shell 3.4 signals
                this._signalHandler.push(
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
                
                break;
            case"6":
                // Gnome Shell 3.6 signals
                this._signalHandler.push(
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
                        Main.panel.menuManager,
                        'menu-added',
                        Lang.bind(this, this._onPanelMenuAdded)
                    ],
                    [
                        Main.overview._viewSelector,
                        'show-page',
                        Lang.bind(this, this._overviewPageChanged)
                    ]
                );

                // Detect gnome panel popup menus
                for (let i = 0; i < Main.panel.menuManager._menus.length; i++) {
                    this._signalHandler.push([Main.panel.menuManager._menus[i].menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
                }

                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
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

        if (this._windowChangedTimeout > 0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

		this._restoreGnomeShellFunctions();
    },

    // main function called during init to override gnome shell 3.4/3.6/#
    _overrideGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _overrideGnomeShellFunctions");
        switch (this._gsCurrentVersion[1]) {
            case"4":
                this._overrideGnomeShell34Functions();
                break;
            case"6":
                this._overrideGnomeShell36Functions();
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }
    },

    // main function called during destroy to restore gnome shell 3.4/3.6/#
    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _restoreGnomeShellFunctions");
        switch (this._gsCurrentVersion[1]) {
            case"4":
                this._restoreGnomeShell34Functions();
                break;
            case"6":
                this._restoreGnomeShell36Functions();
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }
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
    
    // gnome shell 3.6 function overrides
	_overrideGnomeShell36Functions: function() {
        // Override the ViewSelector showPage function to emit a signal when overview page changes
		// Copied from Gnome Shell .. emit 'show-page' added
        let p = ViewSelector.ViewSelector.prototype;
        this.saved_ViewSelector_showPage = p._showPage;
		p._showPage = function(page) {
			if(page == this._activePage)
				return;

			if(this._activePage) {
				Tweener.addTween(this._activePage,
								 { opacity: 0,
								   time: 0.1,
								   transition: 'easeOutQuad',
								   onComplete: Lang.bind(this,
									   function() {
										   this._activePage.hide();
										   this._activePage = page;
									   })
								 });
			}

			page.show();
			this.emit('show-page', page);
			Tweener.addTween(page,
							 { opacity: 255,
							   time: 0.1,
							   transition: 'easeOutQuad'
							 });
		};

        // Override the PopupMenuManager addMenu function to emit a signal when new menus are added
		// Copied from Gnome Shell .. emit 'menu-added' added
        let p = PopupMenu.PopupMenuManager.prototype;
        this.saved_PopupMenuManager_addMenu = p.addMenu;
        p.addMenu = function(menu, position) {
            if (this._findMenu(menu) > -1)
                return;

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

        // Override the GrabHelper grab function to emit a signal when focus is grabbed
		// Copied from Gnome Shell .. emit 'focus-grabbed' added
        let p = GrabHelper.GrabHelper.prototype;
		this.saved_GrabHelper_grab = p.grab;
		p.grab = function(params) {
            params = Params.parse(params, { actor: null,
                                            modal: false,
                                            grabFocus: false,
                                            onUngrab: null });

            let focus = global.stage.key_focus;
            let hadFocus = focus && this._isWithinGrabbedActor(focus);
            let newFocus = params.actor;

            if (this.isActorGrabbed(params.actor))
                return true;

            params.savedFocus = focus;

            if (params.modal && !this._takeModalGrab())
                return false;

            if (params.grabFocus && !this._takeFocusGrab(hadFocus))
                return false;

            if (hadFocus || params.grabFocus)
               GrabHelper._navigateActor(newFocus);

            this._grabStack.push(params);
            this.emit('focus-grabbed');
            return true;
		};


        // Override the GrabHelper ungrab function to emit a signal when focus is ungrabbed
		// Copied from Gnome Shell .. emit 'focus-ungrabbed' added
		let p = GrabHelper.GrabHelper.prototype;
		this.saved_GrabHelper_ungrab = p.ungrab;
		p.ungrab = function(params) {
            params = Params.parse(params, { actor: this.currentGrab.actor });

            let grabStackIndex = this._findStackIndex(params.actor);
            if (grabStackIndex < 0)
                return;

            let focus = global.stage.key_focus;
            let hadFocus = focus && this._isWithinGrabbedActor(focus);

            let poppedGrabs = this._grabStack.slice(grabStackIndex);
            // "Pop" all newly ungrabbed actors off the grab stack
            // by truncating the array.
            this._grabStack.length = grabStackIndex;

            for (let i = poppedGrabs.length - 1; i >= 0; i--) {
                let poppedGrab = poppedGrabs[i];

                if (poppedGrab.onUngrab)
                    poppedGrab.onUngrab();

                if (poppedGrab.modal)
                    this._releaseModalGrab();

                if (poppedGrab.grabFocus)
                    this._releaseFocusGrab();
            }

            if (hadFocus) {
                let poppedGrab = poppedGrabs[0];
                GrabHelper._navigateActor(poppedGrab.savedFocus);
            }

            this.emit('focus-ungrabbed');
		};
		Signals.addSignalMethods(GrabHelper.GrabHelper.prototype);
	},
	
    // gnome shell 3.4 function restores
	_restoreGnomeShell34Functions: function() {
        // Restore normal PopupMenuManager addMenu function
        let p = PopupMenu.PopupMenuManager.prototype;
        p.addMenu = this.saved_PopupMenuManager_addMenu;
    },
    
    // gnome shell 3.6 function restores
    _restoreGnomeShell36Functions: function() {
		// Restore normal ViewSelector showPage function
        let p = ViewSelector.ViewSelector.prototype;
        p._showPage = this.saved_ViewSelector_showPage;

        // Restore normal PopupMenuManager addMenu function
        let p = PopupMenu.PopupMenuManager.prototype;
        p.addMenu = this.saved_PopupMenuManager_addMenu;
        
        // Restore normal GrabHelper grab function
        let p = GrabHelper.GrabHelper.prototype;
        p.grab = this.saved_GrabHelper_grab;
        
        // Restore normal GrabHelper ungrab function
        let p = GrabHelper.GrabHelper.prototype;
        p.ungrab = this.saved_GrabHelper_ungrab;
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
		this._updateDockVisibility();
	},

    // handler for when thumbnail windows dragging started
    _onWindowDragBegin: function() {
        Main.overview.show();
        this._toggledOverviewOnDrag = true;
    },
    
    // handler for when thumbnail windows dragging cancelled
    _onWindowDragCancelled: function() {
        if (this._toggledOverviewOnDrag) {
            this._toggledOverviewOnDrag = false;
            Main.overview.hide();
        }
    },

    // handler for when thumbnail windows dragging ended
    _onWindowDragEnd: function() {
        if (this._toggledOverviewOnDrag) {
            this._toggledOverviewOnDrag = false;
            Main.overview.hide();
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

    // handler for when Gnome Shell 3.6 overview page is changed
    // for example, when Applications button is clicked the workspaces dock is hidden
    // or when search is started the workspaces dock is hidden
    _overviewPageChanged: function(source, page) {
        if (_DEBUG_) global.log("intellihide: _overviewPageChanged");
        if (this._inOverview) {
            if (page == Main.overview._viewSelector._workspacesPage) {
                this._show();
            } else {
                this._hide();
            }
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
        let focusedActor;
        switch (this._gsCurrentVersion[1]) {
            case "4":
                focusedActor = source.actor;
                break;
            case "6":
                let idx = source._grabStack.length - 1;
                focusedActor = source._grabStack[idx].actor;
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }
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
            switch (this._gsCurrentVersion[1]) {
                case "4":
                    if (Main.overview._viewSelector._activeTab.id == "windows") this._show();
                    break;
                case "6":
                    if (Main.overview._viewSelector._activePage == Main.overview._viewSelector._workspacesPage) this._show();
                    break;
                default:
                    throw new Error("Unknown version number (intellihide.js).");
            }
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
                switch (this._gsCurrentVersion[1]) {
                    case "4":
                        if (Main.overview._viewSelector._activeTab.id == "windows") this._show();
                        break;
                    case "6":
                        if (Main.overview._viewSelector._activePage == Main.overview._viewSelector._workspacesPage) this._show();
                        break;
                    default:
                        throw new Error("Unknown version number (intellihide.js).");
                }
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
        if (this.status == null || this.status == false) {
            if (this._settings.get_boolean('dock-fixed')) {
                if (_DEBUG_) global.log("intellihide: _show - fadeInDock");
				if (this.status == null) {
                    // do slow fade in when first showing dock
                    this._target.fadeInDock(this._settings.get_double('animation-time'), 0);
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
            if (this._settings.get_boolean('dock-fixed')) {
                if (_DEBUG_) global.log("intellihide: _hide - fadeOutDock");
                if (nonreactive) {
                    // hide and make stage nonreactive so meta popup windows receive hover and clicks
                    this._target.fadeOutDock(this._settings.get_double('animation-time'), 0, true);
                } else {
                    this._target.fadeOutDock(this._settings.get_double('animation-time'), 0, false);
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
                        //let msg = wclass + " [" + wtype + "] focused? " + wfocus + " app? " + wapp;
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

};
